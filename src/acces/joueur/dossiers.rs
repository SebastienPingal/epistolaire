//! Les dossiers d'un joueur, où il range son courrier.
//!
//! Un dossier appartient à son joueur : sa table se lit et s'écrit directement, toujours
//! filtrée sur `proprietaire_id`. Les plis qu'il contient, eux, ne se lisent que dans la vue
//! `plis_recus`, et ne bougent que par les fonctions de [`super::courrier`].
//!
//! Supprimer un dossier détruit les plis qu'il contient (décision du MJ) : ils disparaissent
//! pour le joueur, mais la base et le MJ les gardent.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use super::courrier::{PliFerme, detruire_pli, plis_du_dossier};
use crate::acces::Joueur;
use crate::base;
use crate::calendrier::Calendrier;
use crate::erreur::{Erreur, refus_de_la_base};

const DOSSIERS_MAX: i64 = 30;
const LONGUEUR_NOM_MAX: usize = 60;

const REFUS_NOM: Erreur = Erreur::Refus("Le nom d'un dossier compte de 1 à 60 caractères.");
const REFUS_DOUBLON: &str = "Vous avez déjà un dossier de ce nom.";

/// Un dossier du joueur, et le nombre de plis qu'il contient.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Dossier {
    pub id: Uuid,
    pub nom: String,
    pub nombre: i32,
}

/// Un dossier ouvert : les plis qu'il contient, du plus récent au plus ancien.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct ContenuDossier {
    pub dossier: Dossier,
    pub plis: Vec<PliFerme>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct DossierSaisi {
    pub nom: String,
}

/// Les dossiers du joueur, par ordre alphabétique.
pub(super) async fn mes_dossiers(pool: &PgPool, joueur: &Joueur) -> Result<Vec<Dossier>, Erreur> {
    Ok(sqlx::query_as!(
        Dossier,
        r#"
        select
            d.id,
            d.nom,
            (select count(*) from plis_recus r
             where r.destinataire_id = d.proprietaire_id and r.dossier_id = d.id)::int as "nombre!"
        from dossiers d
        where d.proprietaire_id = $1
        order by d.rang, lower(d.nom), d.cree_le
        "#,
        joueur.personnage_id(),
    )
    .fetch_all(pool)
    .await?)
}

async fn mon_dossier(pool: &PgPool, joueur: &Joueur, id: Uuid) -> Result<Dossier, Erreur> {
    mes_dossiers(pool, joueur)
        .await?
        .into_iter()
        .find(|dossier| dossier.id == id)
        .ok_or(Erreur::Introuvable)
}

fn nom_valide(saisie: &DossierSaisi) -> Result<String, Erreur> {
    let nom = saisie.nom.trim();
    if nom.is_empty() || nom.chars().count() > LONGUEUR_NOM_MAX {
        return Err(REFUS_NOM);
    }
    Ok(nom.to_owned())
}

pub async fn lire(joueur: Joueur, Path(id): Path<Uuid>) -> Result<Json<ContenuDossier>, Erreur> {
    let pool = base::pool().await?;
    let dossier = mon_dossier(pool, &joueur, id).await?;
    let calendrier = Calendrier::lire(pool).await?;
    let plis = plis_du_dossier(pool, &joueur, &calendrier, Some(id)).await?;
    Ok(Json(ContenuDossier { dossier, plis }))
}

pub async fn creer(joueur: Joueur, Json(saisie): Json<DossierSaisi>) -> Result<Json<Dossier>, Erreur> {
    let nom = nom_valide(&saisie)?;
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // Le verrou sur le personnage empêche deux créations simultanées de dépasser la limite.
    sqlx::query!(
        "select id from personnages where id = $1 for update",
        joueur.personnage_id(),
    )
    .fetch_one(&mut *transaction)
    .await?;

    let existants = sqlx::query_scalar!(
        r#"select count(*) as "nombre!" from dossiers where proprietaire_id = $1"#,
        joueur.personnage_id(),
    )
    .fetch_one(&mut *transaction)
    .await?;
    if existants >= DOSSIERS_MAX {
        return Err(Erreur::Refus("Vous avez déjà 30 dossiers : supprimez-en un d'abord."));
    }

    let id = sqlx::query_scalar!(
        "insert into dossiers (proprietaire_id, nom) values ($1, $2) returning id",
        joueur.personnage_id(),
        nom,
    )
    .fetch_one(&mut *transaction)
    .await
    .map_err(refus_de_la_base(REFUS_DOUBLON, REFUS_DOUBLON))?;

    transaction.commit().await?;
    Ok(Json(Dossier { id, nom, nombre: 0 }))
}

pub async fn renommer(
    joueur: Joueur,
    Path(id): Path<Uuid>,
    Json(saisie): Json<DossierSaisi>,
) -> Result<Json<Dossier>, Erreur> {
    let nom = nom_valide(&saisie)?;
    let pool = base::pool().await?;
    let modifie = sqlx::query!(
        "update dossiers set nom = $3 where id = $1 and proprietaire_id = $2",
        id,
        joueur.personnage_id(),
        nom,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base(REFUS_DOUBLON, REFUS_DOUBLON))?;
    if modifie.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    mon_dossier(pool, &joueur, id).await.map(Json)
}

/// Supprime un dossier, et détruit les plis qu'il contient.
pub async fn supprimer(joueur: Joueur, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // Le verrou empêche de ranger un pli dans ce dossier pendant qu'on le vide.
    sqlx::query!(
        "select id from dossiers where id = $1 and proprietaire_id = $2 for update",
        id,
        joueur.personnage_id(),
    )
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;

    let contenus = sqlx::query_scalar!(
        r#"select id as "id!" from plis_recus where destinataire_id = $1 and dossier_id = $2"#,
        joueur.personnage_id(),
        id,
    )
    .fetch_all(&mut *transaction)
    .await?;
    for pli in contenus {
        if !detruire_pli(&mut transaction, &joueur, pli).await? {
            return Err(Erreur::Introuvable);
        }
    }

    sqlx::query!(
        "delete from dossiers where id = $1 and proprietaire_id = $2",
        id,
        joueur.personnage_id(),
    )
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
