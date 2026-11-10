//! La porte des joueurs : tout ce qui se trouve sous `/api/joueur`.
//!
//! Règles de ce dossier :
//!
//! * chaque traitement prend un [`Joueur`](super::Joueur) en paramètre, et ne répond que
//!   pour son personnage ;
//! * le courrier reçu ne se lit que dans la vue `plis_recus` ;
//! * ses propres lettres ne se lisent et ne se modifient que dans la vue `brouillons` :
//!   une lettre envoyée n'appartient plus à son auteur.
//!
//! Deux gestes seulement touchent la table `plis`, tous deux dans [`ecritoire`] :
//! compter les envois de la semaine pour le quota, et l'envoi lui-même.

pub mod courrier;
mod ecritoire;
mod fiche;

use axum::Router;
use axum::routing::{get, post};

pub fn routes() -> Router {
    Router::new()
        .route("/ecritoire", get(ecritoire::lire))
        .route("/brouillons", post(ecritoire::commencer))
        .route(
            "/brouillons/{id}",
            get(ecritoire::lire_brouillon)
                .put(ecritoire::enregistrer)
                .delete(ecritoire::jeter),
        )
        .route("/brouillons/{id}/envoi", post(ecritoire::envoyer))
        .route("/fiche", get(fiche::lire))
}
