//! Serveur du jeu épistolaire.
//!
//! Le vocabulaire du code suit celui de `DECISIONS.md` : pli, exemplaire, sceau, carnet…

pub mod base;
pub mod sante;

use axum::http::{StatusCode, Uri};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

/// Le routeur complet, partagé par la fonction Vercel et le serveur local.
pub fn routeur() -> Router {
    let api = Router::new().route("/sante", get(sante::sante));

    Router::new().nest("/api", api).fallback(introuvable)
}

async fn introuvable(uri: Uri) -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "erreur": "introuvable", "chemin": uri.path() })),
    )
}
