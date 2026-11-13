//! La porte du MJ : tout ce qui se trouve sous `/api/mj`.
//!
//! Règle de ce dossier : chaque traitement prend un [`Mj`](super::Mj) en paramètre.
//! C'est ce qui garantit qu'un joueur, même connecté, n'obtient rien d'ici.

mod acheminement;
mod detruits;
mod ecritures;
mod en_route;
mod file;
mod notifications;
mod personnages;
mod plume;
mod reglages;
mod sceaux;

use axum::Router;
use axum::routing::{delete, get, post, put};

pub fn routes() -> Router {
    Router::new()
        // Le courrier : la file, les plis en route, et la plume du MJ.
        .route("/a-traiter", get(file::lister))
        .route("/a-traiter/{id}/traitement", post(file::traiter))
        .route(
            "/a-traiter/{id}/ecart",
            post(file::ecarter).delete(file::reprendre),
        )
        .route("/en-route", get(en_route::lister))
        .route("/exemplaires/{id}", put(en_route::modifier))
        .route("/exemplaires/{id}/copie", post(en_route::copier))
        .route("/lettres", post(plume::ecrire))
        .route("/detruits", get(detruits::lister))
        // La préparation de la partie.
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
        .route("/reglages/calendrier", get(reglages::calendrier))
        .route("/reglages/bonds", post(reglages::ajouter_bond))
        .route("/reglages/bonds/{id}", delete(reglages::retirer_bond))
        // Être prévenu.
        .route("/pastille", get(notifications::pastille))
        .route("/notifications", get(notifications::lire).put(notifications::choisir))
        .route("/notifications/essai", post(notifications::essayer))
        .route(
            "/abonnements",
            post(notifications::abonner).delete(notifications::desabonner),
        )
}

/// Un texte obligatoire : sans espaces autour, non vide, de longueur raisonnable.
fn texte_requis(valeur: &str, refus: &'static str) -> Result<String, crate::erreur::Erreur> {
    let valeur = valeur.trim();
    if valeur.is_empty() || valeur.chars().count() > 200 {
        return Err(crate::erreur::Erreur::Refus(refus));
    }
    Ok(valeur.to_owned())
}
