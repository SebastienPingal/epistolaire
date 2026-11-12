//! Les notifications du joueur : ses canaux, ses navigateurs abonnés, et la pastille.
//!
//! Les choix appartiennent au compte, pas au personnage : le traitement commun
//! (`crate::notifications`) prend l'identifiant du compte, retrouvé ici à partir du joueur.
//! La pastille compte les plis non ouverts, dans la vue `plis_recus`.

use axum::Json;
use axum::http::StatusCode;
use sqlx::PgPool;
use uuid::Uuid;

use super::super::Joueur;
use crate::base;
use crate::erreur::Erreur;
use crate::notifications::{
    self, AbonnementNavigateur, ChoixNotifications, FinAbonnement, MesNotifications, Pastille,
};

pub async fn lire(joueur: Joueur) -> Result<Json<MesNotifications>, Erreur> {
    let pool = base::pool().await?;
    let compte = compte_du_joueur(pool, &joueur).await?;
    Ok(Json(notifications::lire(pool, compte).await?))
}

pub async fn choisir(
    joueur: Joueur,
    Json(choix): Json<ChoixNotifications>,
) -> Result<Json<MesNotifications>, Erreur> {
    let pool = base::pool().await?;
    let compte = compte_du_joueur(pool, &joueur).await?;
    Ok(Json(notifications::choisir(pool, compte, &choix).await?))
}

pub async fn abonner(
    joueur: Joueur,
    Json(abonnement): Json<AbonnementNavigateur>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let compte = compte_du_joueur(pool, &joueur).await?;
    notifications::abonner(pool, compte, &abonnement).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn desabonner(
    joueur: Joueur,
    Json(fin): Json<FinAbonnement>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let compte = compte_du_joueur(pool, &joueur).await?;
    notifications::desabonner(pool, compte, &fin).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Le nombre de plis non ouverts, Réception et dossiers compris.
pub async fn pastille(joueur: Joueur) -> Result<Json<Pastille>, Erreur> {
    let pool = base::pool().await?;
    let nombre = sqlx::query_scalar!(
        r#"
        select count(*)::int as "nombre!"
        from plis_recus
        where destinataire_id = $1 and ouvert_le is null
        "#,
        joueur.personnage_id(),
    )
    .fetch_one(pool)
    .await?;
    Ok(Json(Pastille { nombre }))
}

async fn compte_du_joueur(pool: &PgPool, joueur: &Joueur) -> Result<Uuid, Erreur> {
    sqlx::query_scalar!(
        "select compte_id from personnages where id = $1",
        joueur.personnage_id(),
    )
    .fetch_one(pool)
    .await?
    .ok_or(Erreur::Interdit)
}
