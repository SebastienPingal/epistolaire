//! La copie de la base : un seul document JSON, compressé.
//!
//! ```json
//! { "structure": 6, "faite_le": "…", "tables": { "plis": [ … ], "exemplaires": [ … ] } }
//! ```
//!
//! Toutes les tables du schéma `public` y sont, `_sqlx_migrations` comprise : la
//! restauration vérifie qu'elle les trouve toutes. Elles sont lues dans une seule
//! transaction en lecture seule, qui voit la base telle qu'elle était au premier instant :
//! un pli envoyé pendant la copie n'y est pas à moitié.
//!
//! Exception à la règle des requêtes vérifiées à la compilation : le nom d'une table ne
//! peut pas être un paramètre. Les noms viennent de la base elle-même
//! (`information_schema`), et sont mis entre guillemets.

use std::collections::BTreeMap;
use std::io::{Read, Write};

use chrono::{DateTime, Utc};
use flate2::Compression;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;

use crate::erreur::Erreur;

/// La table où sqlx note les migrations appliquées.
pub const TABLE_DES_MIGRATIONS: &str = "_sqlx_migrations";

/// Le contenu d'une copie.
#[derive(Serialize, Deserialize)]
pub struct Copie {
    /// Le numéro de la dernière migration appliquée à la base copiée.
    pub structure: i64,
    pub faite_le: DateTime<Utc>,
    /// Chaque table, avec toutes ses lignes.
    pub tables: BTreeMap<String, Vec<Value>>,
}

/// Une copie prête à déposer.
pub struct CopieCompressee {
    /// Le jour et l'heure de la copie, dans le fuseau des réglages (Paris), à la milliseconde près : `2026-11-16-040012-345`.
    pub horodatage: String,
    pub octets: Vec<u8>,
}

/// Copie toute la base, et la compresse.
pub async fn copier(pool: &PgPool) -> Result<CopieCompressee, Erreur> {
    let mut transaction = pool.begin().await?;
    // Une photographie de la base : tout ce qui est lu ensuite date du même instant.
    sqlx::query("set transaction isolation level repeatable read, read only")
        .execute(&mut *transaction)
        .await?;

    let reperes = sqlx::query!(
        r#"
        select
            now() as "maintenant!",
            to_char(now() at time zone r.fuseau, 'YYYY-MM-DD-HH24MISS-MS') as "horodatage!",
            (select max(version) from _sqlx_migrations where success) as "structure"
        from reglages r
        "#,
    )
    .fetch_one(&mut *transaction)
    .await?;
    let structure = reperes
        .structure
        .ok_or_else(|| Erreur::interne("la base n'a aucune migration appliquée"))?;

    let mut tables = BTreeMap::new();
    for table in tables_de_la_base(&mut *transaction).await? {
        let requete = format!(
            "select coalesce(json_agg(t), '[]'::json) from {} t",
            identifiant(&table)
        );
        let lignes: Value = sqlx::query_scalar(&requete).fetch_one(&mut *transaction).await?;
        let Value::Array(lignes) = lignes else {
            return Err(Erreur::interne(format!("table {table} : lecture inattendue")));
        };
        tables.insert(table, lignes);
    }
    transaction.commit().await?;

    let copie = Copie {
        structure,
        faite_le: reperes.maintenant,
        tables,
    };
    Ok(CopieCompressee {
        horodatage: reperes.horodatage,
        octets: compresser(&copie)?,
    })
}

/// Les tables du schéma `public`, par ordre alphabétique.
pub async fn tables_de_la_base(
    executeur: impl sqlx::PgExecutor<'_>,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"
        select table_name::text as "nom!"
        from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by 1
        "#,
    )
    .fetch_all(executeur)
    .await
}

/// Un nom de table, entre guillemets, prêt à écrire dans une requête.
pub fn identifiant(nom: &str) -> String {
    format!("\"{}\"", nom.replace('"', "\"\""))
}

pub fn compresser(copie: &Copie) -> Result<Vec<u8>, Erreur> {
    let json = serde_json::to_vec(copie).map_err(Erreur::interne)?;
    let mut compresseur = GzEncoder::new(Vec::new(), Compression::default());
    compresseur.write_all(&json).map_err(Erreur::interne)?;
    compresseur.finish().map_err(Erreur::interne)
}

pub fn decompresser(octets: &[u8]) -> Result<Copie, String> {
    let mut json = Vec::new();
    GzDecoder::new(octets)
        .read_to_end(&mut json)
        .map_err(|erreur| format!("le fichier n'est pas une copie compressée : {erreur}"))?;
    serde_json::from_slice(&json)
        .map_err(|erreur| format!("le fichier n'est pas une copie de la base : {erreur}"))
}
