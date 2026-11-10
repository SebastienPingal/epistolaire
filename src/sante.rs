//! Page de contrôle : le serveur répond-il, la base aussi, sa structure est-elle en place ?
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
    /// Le numéro de la dernière migration appliquée à la base.
    #[ts(type = "number | null")]
    pub structure: Option<i64>,
}

pub async fn sante() -> Json<Sante> {
    let lecture = lire().await;
    if let Err(erreur) = &lecture {
        eprintln!("sante : la base ne répond pas : {erreur}");
    }

    let (heure_base, structure) = match lecture {
        Ok((heure, structure)) => (Some(heure), structure),
        Err(_) => (None, None),
    };

    Json(Sante {
        serveur: true,
        base: heure_base.is_some(),
        heure_base,
        structure,
    })
}

async fn lire() -> Result<(DateTime<Utc>, Option<i64>), sqlx::Error> {
    let pool = base::pool().await?;
    let heure = sqlx::query_scalar!(r#"select now() as "heure!""#)
        .fetch_one(pool)
        .await?;
    let structure = base::version_structure().await?;
    Ok((heure, structure))
}
