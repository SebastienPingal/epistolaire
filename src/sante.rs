//! Page de contrôle de l'étape 1 : le serveur répond-il, la base aussi ?
//! Elle ne montre rien du jeu.

use axum::Json;
use chrono::{DateTime, Utc};
use serde::Serialize;
use ts_rs::TS;

use crate::base;

#[derive(Serialize, TS)]
#[ts(export)]
pub struct Sante {
    pub serveur: bool,
    pub base: bool,
    /// L'heure lue dans la base, si elle répond.
    pub heure_base: Option<DateTime<Utc>>,
}

pub async fn sante() -> Json<Sante> {
    let heure = lire_heure().await;
    if let Err(erreur) = &heure {
        eprintln!("sante : la base ne répond pas : {erreur}");
    }

    Json(Sante {
        serveur: true,
        base: heure.is_ok(),
        heure_base: heure.ok(),
    })
}

async fn lire_heure() -> Result<DateTime<Utc>, sqlx::Error> {
    let pool = base::pool().await?;
    sqlx::query_scalar!(r#"select now() as "heure!""#)
        .fetch_one(pool)
        .await
}
