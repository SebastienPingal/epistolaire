//! Serveur du jeu épistolaire.
//!
//! Le vocabulaire du code suit celui de `DECISIONS.md` : pli, exemplaire, sceau, carnet…

pub mod acces;
pub mod base;
pub mod calendrier;
pub mod connexion;
pub mod courriel;
pub mod erreur;
pub mod modele;
pub mod sante;

use axum::http::{StatusCode, Uri};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};

/// Le routeur complet, partagé par la fonction Vercel et le serveur local.
pub fn routeur() -> Router {
    let api = Router::new()
        .route("/sante", get(sante::sante))
        .route("/connexion/demande", post(connexion::demander))
        .route("/connexion/code", post(connexion::verifier_code))
        .route("/connexion/lien", post(connexion::verifier_lien))
        .route("/deconnexion", post(connexion::deconnecter))
        .route("/moi", get(connexion::moi));

    Router::new()
        .nest(
            "/api",
            api.nest("/mj", acces::mj::routes())
                .nest("/joueur", acces::joueur::routes()),
        )
        .fallback(introuvable)
}

async fn introuvable(uri: Uri) -> (StatusCode, Json<Value>) {
    (
        StatusCode::NOT_FOUND,
        Json(json!({ "erreur": "introuvable", "chemin": uri.path() })),
    )
}
