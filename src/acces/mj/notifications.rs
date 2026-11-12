//! Les notifications du MJ : ses canaux, ses navigateurs abonnés, et la pastille
//! d'À traiter. Le traitement commun est dans `crate::notifications`.

use axum::Json;
use axum::http::StatusCode;

use super::super::Mj;
use crate::base;
use crate::erreur::Erreur;
use crate::notifications::{
    self, AbonnementNavigateur, ChoixNotifications, FinAbonnement, MesNotifications, Pastille,
};

pub async fn lire(mj: Mj) -> Result<Json<MesNotifications>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(notifications::lire(pool, mj.compte_id()).await?))
}

pub async fn choisir(
    mj: Mj,
    Json(choix): Json<ChoixNotifications>,
) -> Result<Json<MesNotifications>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(notifications::choisir(pool, mj.compte_id(), &choix).await?))
}

pub async fn abonner(
    mj: Mj,
    Json(abonnement): Json<AbonnementNavigateur>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    notifications::abonner(pool, mj.compte_id(), &abonnement).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn desabonner(mj: Mj, Json(fin): Json<FinAbonnement>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    notifications::desabonner(pool, mj.compte_id(), &fin).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Le nombre de lettres dans la file À traiter.
pub async fn pastille(_mj: Mj) -> Result<Json<Pastille>, Erreur> {
    let pool = base::pool().await?;
    let nombre = sqlx::query_scalar!(
        r#"select count(*)::int as "nombre!" from plis where etat = 'a_traiter'"#
    )
    .fetch_one(pool)
    .await?;
    Ok(Json(Pastille { nombre }))
}
