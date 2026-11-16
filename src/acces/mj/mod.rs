//! La porte du MJ : tout ce qui se trouve sous `/api/mj`.
//!
//! Règle de ce dossier : chaque traitement prend un [`Mj`](super::Mj) en paramètre.
//! C'est ce qui garantit qu'un joueur, même connecté, n'obtient rien d'ici.

mod acheminement;
mod alterations;
mod detruits;
mod documents;
mod ecritures;
mod en_route;
mod file;
mod images;
mod notifications;
mod personnages;
mod plume;
mod reglages;
mod sauvegardes;
mod sceaux;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::routing::{delete, get, post, put};

use crate::images::TAILLE_MAX;

pub fn routes() -> Router {
    Router::new()
        // Le courrier : la file, les plis en route, et les documents du MJ.
        .route("/a-traiter", get(file::lister))
        .route("/a-traiter/{id}/traitement", post(file::traiter))
        .route(
            "/a-traiter/{id}/ecart",
            post(file::ecarter).delete(file::reprendre),
        )
        .route("/en-route", get(en_route::lister))
        .route(
            "/exemplaires/{id}",
            get(alterations::lire).put(en_route::modifier),
        )
        .route("/exemplaires/{id}/version", put(alterations::alterer))
        .route("/exemplaires/{id}/copie", post(en_route::copier))
        .route("/documents", post(documents::envoyer))
        // Les images des documents et des sceaux. Le dépôt reçoit le fichier lui-même :
        // sa limite est celle d'une image, pas celle d'une demande ordinaire.
        .route(
            "/images",
            get(images::lister)
                .post(images::deposer)
                .layer(DefaultBodyLimit::max(TAILLE_MAX + 1024)),
        )
        .route("/images/{id}", get(images::afficher))
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
        .route("/sauvegardes", get(sauvegardes::lister).post(sauvegardes::faire))
        .route("/sauvegardes/{nom}", get(sauvegardes::telecharger))
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
