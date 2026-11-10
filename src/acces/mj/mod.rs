//! La porte du MJ : tout ce qui se trouve sous `/api/mj`.
//!
//! Règle de ce dossier : chaque traitement prend un [`Mj`](super::Mj) en paramètre.
//! C'est ce qui garantit qu'un joueur, même connecté, n'obtient rien d'ici.

mod ecritures;
mod personnages;
mod reglages;
mod sceaux;

use axum::Router;
use axum::routing::{get, put};

pub fn routes() -> Router {
    Router::new()
        .route("/personnages", get(personnages::lister).post(personnages::creer))
        .route(
            "/personnages/{id}",
            get(personnages::lire)
                .put(personnages::modifier)
                .delete(personnages::supprimer),
        )
        .route(
            "/personnages/{id}/carnet/{contact_id}",
            put(personnages::noter_contact).delete(personnages::retirer_contact),
        )
        .route("/ecritures", get(ecritures::lister))
        .route("/ecritures/{id}", put(ecritures::modifier))
        .route("/sceaux", get(sceaux::lister).post(sceaux::creer))
        .route("/sceaux/{id}", put(sceaux::modifier).delete(sceaux::supprimer))
        .route("/reglages", get(reglages::lire).put(reglages::modifier))
}

/// Un texte obligatoire : sans espaces autour, non vide, de longueur raisonnable.
fn texte_requis(valeur: &str, refus: &'static str) -> Result<String, crate::erreur::Erreur> {
    let valeur = valeur.trim();
    if valeur.is_empty() || valeur.chars().count() > 200 {
        return Err(crate::erreur::Erreur::Refus(refus));
    }
    Ok(valeur.to_owned())
}
