//! Remettre une copie dans une base neuve.
//!
//! Utilisée par le programme `restaurer` (`src/bin/restaurer.rs`). Jamais par le site.
//!
//! Le déroulé, et ses garde-fous :
//!
//! 1. la base visée ne doit contenir aucun pli, et ne pas avoir une structure plus récente
//!    que la copie : on ne restaure jamais par-dessus du courrier ;
//! 2. les migrations sont appliquées jusqu'au numéro de la copie, pas au-delà : la copie
//!    retrouve exactement la structure qu'elle avait. Le site appliquera les suivantes
//!    à son démarrage, comme d'habitude ;
//! 3. la copie doit contenir toutes les tables de cette structure, et rien d'autre : une
//!    copie partielle est refusée, plutôt que restaurée en silence ;
//! 4. tout est chargé dans une seule transaction : en cas d'erreur, la base reste vide.
//!    Les tables sont chargées dans l'ordre de leurs dépendances (un personnage avant
//!    ses plis, un pli avant ses exemplaires), ce qui n'exige pas les droits
//!    d'administrateur que demanderait la suspension des contrôles de clés ;
//! 5. les compteurs (la colonne `id` de `evenements`) repartent après la plus grande
//!    valeur chargée ;
//! 6. le nombre de lignes de chaque table est comparé à celui de la copie avant de valider.
//!
//! Exception à la règle des requêtes vérifiées à la compilation : les noms des tables
//! viennent de la base et de la copie, ils ne peuvent pas être des paramètres.

use std::borrow::Cow;
use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;
use sqlx::migrate::Migrator;
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};

use super::copie::{Copie, TABLE_DES_MIGRATIONS, identifiant, tables_de_la_base};

/// Ce que la restauration a chargé : chaque table et son nombre de lignes.
pub struct Bilan {
    pub structure: i64,
    pub lignes: BTreeMap<String, usize>,
}

/// Restaure la copie dans la base à cette adresse.
pub async fn restaurer(copie: &Copie, adresse: &str) -> Result<Bilan, String> {
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(adresse)
        .await
        .map_err(|erreur| format!("connexion à la base impossible : {erreur}"))?;
    let bilan = restaurer_dans(copie, &pool).await;
    pool.close().await;
    bilan
}

async fn restaurer_dans(copie: &Copie, pool: &PgPool) -> Result<Bilan, String> {
    let echec = |etape: &'static str| move |erreur: sqlx::Error| format!("{etape} : {erreur}");

    // 1. Une base neuve, ou du moins sans courrier.
    let existe = |table: &'static str| async move {
        sqlx::query_scalar::<_, bool>("select to_regclass($1) is not null")
            .bind(format!("public.{table}"))
            .fetch_one(pool)
            .await
    };
    if existe("plis").await.map_err(echec("lecture de la base"))? {
        let plis: i64 = sqlx::query_scalar("select count(*) from plis")
            .fetch_one(pool)
            .await
            .map_err(echec("lecture de la base"))?;
        if plis > 0 {
            return Err(
                "la base visée contient déjà du courrier : restaurez dans une base neuve".into(),
            );
        }
    }
    if existe(TABLE_DES_MIGRATIONS).await.map_err(echec("lecture des migrations"))? {
        let appliquee: Option<i64> =
            sqlx::query_scalar("select max(version) from _sqlx_migrations where success")
                .fetch_one(pool)
                .await
                .map_err(echec("lecture des migrations"))?;
        if let Some(version) = appliquee.filter(|version| *version > copie.structure) {
            return Err(format!(
                "la base visée a une structure plus récente ({version}) que la copie ({}) : restaurez dans une base neuve",
                copie.structure
            ));
        }
    }

    // 2. La structure de la copie, ni plus ni moins.
    let toutes = crate::base::migrations();
    if !toutes.iter().any(|migration| migration.version == copie.structure) {
        return Err(format!(
            "ce programme ne connaît pas la structure {} de la copie : mettez-le à jour",
            copie.structure
        ));
    }
    let jusqu_a_la_copie = Migrator {
        migrations: Cow::Owned(
            toutes
                .iter()
                .filter(|migration| migration.version <= copie.structure)
                .cloned()
                .collect(),
        ),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    };
    jusqu_a_la_copie
        .run(pool)
        .await
        .map_err(|erreur| format!("migrations : {erreur}"))?;

    // 3. Toutes les tables, et rien d'autre.
    let dans_la_base: BTreeSet<String> = tables_de_la_base(pool)
        .await
        .map_err(echec("liste des tables"))?
        .into_iter()
        .collect();
    let dans_la_copie: BTreeSet<String> = copie.tables.keys().cloned().collect();
    let manquantes: Vec<_> = dans_la_base.difference(&dans_la_copie).collect();
    if !manquantes.is_empty() {
        return Err(format!("copie incomplète, il lui manque : {manquantes:?}"));
    }
    let en_trop: Vec<_> = dans_la_copie.difference(&dans_la_base).collect();
    if !en_trop.is_empty() {
        return Err(format!("la copie contient des tables inconnues : {en_trop:?}"));
    }
    verifier_les_migrations(copie, pool).await?;

    // 4. Le chargement, en une seule transaction.
    let ordre = ordre_de_chargement(pool, &dans_la_base).await?;
    let mut transaction = pool.begin().await.map_err(echec("transaction"))?;

    // Les migrations ont déjà rempli quelques tables (les écritures, les réglages) :
    // la copie les remplace.
    let a_vider: Vec<String> = ordre
        .iter()
        .filter(|table| table.as_str() != TABLE_DES_MIGRATIONS)
        .map(|table| identifiant(table))
        .collect();
    sqlx::query(&format!("truncate {} restart identity", a_vider.join(", ")))
        .execute(&mut *transaction)
        .await
        .map_err(echec("vidage des tables"))?;

    let mut lignes = BTreeMap::new();
    for table in &ordre {
        if table == TABLE_DES_MIGRATIONS {
            continue;
        }
        let contenu = &copie.tables[table];
        verifier_les_colonnes(&mut *transaction, table, contenu).await?;
        if !contenu.is_empty() {
            let nom = identifiant(table);
            sqlx::query(&format!(
                "insert into {nom} overriding system value
                 select * from jsonb_populate_recordset(null::{nom}, $1)"
            ))
            .bind(Value::Array(contenu.clone()))
            .execute(&mut *transaction)
            .await
            .map_err(|erreur| format!("chargement de {table} : {erreur}"))?;
        }

        // 6. Le compte y est.
        let nombre: i64 = sqlx::query_scalar(&format!("select count(*) from {}", identifiant(table)))
            .fetch_one(&mut *transaction)
            .await
            .map_err(echec("comptage"))?;
        if nombre as usize != contenu.len() {
            return Err(format!(
                "{table} : {nombre} lignes chargées, {} dans la copie",
                contenu.len()
            ));
        }
        lignes.insert(table.clone(), contenu.len());
    }

    // 5. Les compteurs.
    let compteurs = sqlx::query(
        "select table_name::text, column_name::text
         from information_schema.columns
         where table_schema = 'public' and is_identity = 'YES'",
    )
    .fetch_all(&mut *transaction)
    .await
    .map_err(echec("liste des compteurs"))?;
    for compteur in compteurs {
        let table: String = compteur.get(0);
        let colonne: String = compteur.get(1);
        sqlx::query(&format!(
            "select setval(pg_get_serial_sequence($1, $2), coalesce(max({col}), 0) + 1, false) from {tab}",
            col = identifiant(&colonne),
            tab = identifiant(&table),
        ))
        .bind(identifiant(&table))
        .bind(&colonne)
        .execute(&mut *transaction)
        .await
        .map_err(echec("remise à niveau des compteurs"))?;
    }

    transaction.commit().await.map_err(echec("validation"))?;
    Ok(Bilan {
        structure: copie.structure,
        lignes,
    })
}

/// Les migrations notées dans la copie sont celles que la base vient de recevoir.
async fn verifier_les_migrations(copie: &Copie, pool: &PgPool) -> Result<(), String> {
    let dans_la_copie: BTreeSet<i64> = copie.tables[TABLE_DES_MIGRATIONS]
        .iter()
        .filter(|ligne| ligne["success"].as_bool().unwrap_or(false))
        .filter_map(|ligne| ligne["version"].as_i64())
        .collect();
    let dans_la_base: BTreeSet<i64> =
        sqlx::query_scalar("select version from _sqlx_migrations where success")
            .fetch_all(pool)
            .await
            .map_err(|erreur| format!("lecture des migrations : {erreur}"))?
            .into_iter()
            .collect();
    if dans_la_copie != dans_la_base {
        return Err(format!(
            "les migrations de la copie ({dans_la_copie:?}) ne sont pas celles de la base ({dans_la_base:?})"
        ));
    }
    Ok(())
}

/// Chaque ligne de la copie a exactement les colonnes de la table.
async fn verifier_les_colonnes(
    transaction: &mut sqlx::PgConnection,
    table: &str,
    contenu: &[Value],
) -> Result<(), String> {
    let colonnes: BTreeSet<String> = sqlx::query_scalar(
        "select column_name::text from information_schema.columns
         where table_schema = 'public' and table_name = $1",
    )
    .bind(table)
    .fetch_all(transaction)
    .await
    .map_err(|erreur| format!("colonnes de {table} : {erreur}"))?
    .into_iter()
    .collect();
    for ligne in contenu {
        let Value::Object(champs) = ligne else {
            return Err(format!("{table} : une ligne de la copie n'est pas un objet"));
        };
        let cles: BTreeSet<String> = champs.keys().cloned().collect();
        if cles != colonnes {
            return Err(format!(
                "{table} : les colonnes de la copie ({cles:?}) ne sont pas celles de la table ({colonnes:?})"
            ));
        }
    }
    Ok(())
}

/// Les tables dans l'ordre de leurs dépendances : une table vient après celles
/// qu'elle désigne par une clé.
async fn ordre_de_chargement(pool: &PgPool, tables: &BTreeSet<String>) -> Result<Vec<String>, String> {
    let liens = sqlx::query(
        "select enfant.relname::text, parent.relname::text
         from pg_constraint c
         join pg_class enfant on enfant.oid = c.conrelid
         join pg_class parent on parent.oid = c.confrelid
         where c.contype = 'f' and c.connamespace = 'public'::regnamespace",
    )
    .fetch_all(pool)
    .await
    .map_err(|erreur| format!("lecture des dépendances : {erreur}"))?;

    let mut parents: BTreeMap<&str, BTreeSet<String>> =
        tables.iter().map(|table| (table.as_str(), BTreeSet::new())).collect();
    for lien in liens {
        let enfant: String = lien.get(0);
        let parent: String = lien.get(1);
        if enfant != parent {
            if let Some(attendus) = parents.get_mut(enfant.as_str()) {
                attendus.insert(parent);
            }
        }
    }

    let mut ordre: Vec<String> = Vec::new();
    while ordre.len() < tables.len() {
        let pretes: Vec<String> = parents
            .iter()
            .filter(|(table, attendus)| {
                !ordre.iter().any(|fait| fait == *table)
                    && attendus.iter().all(|parent| ordre.contains(parent))
            })
            .map(|(table, _)| (*table).to_owned())
            .collect();
        if pretes.is_empty() {
            return Err("les tables se désignent en boucle : ordre de chargement introuvable".into());
        }
        ordre.extend(pretes);
    }
    Ok(ordre)
}
