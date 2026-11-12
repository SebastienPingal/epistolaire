//! La porte des joueurs : tout ce qui se trouve sous `/api/joueur`.
//!
//! Règles de ce dossier :
//!
//! * chaque traitement prend un [`Joueur`](super::Joueur) en paramètre, et ne répond que
//!   pour son personnage ;
//! * le courrier reçu ne se lit que dans la vue `plis_recus`, et ne se modifie que par les
//!   fonctions SQL `ouvrir_pli`, `ranger_pli` et `detruire_pli` ;
//! * aucun horodatage de pli ne sort : seulement des dates du jeu ;
//! * ses propres lettres ne se lisent et ne se modifient que dans la vue `brouillons` :
//!   une lettre envoyée n'appartient plus à son auteur ;
//! * ses dossiers lui appartiennent : leur table se lit et s'écrit directement, toujours
//!   filtrée sur le joueur.
//!
//! Deux gestes seulement touchent la table `plis`, tous deux dans [`ecritoire`] :
//! compter les envois de la semaine pour le quota, et l'envoi lui-même.

pub mod courrier;
mod dossiers;
mod ecritoire;
mod fiche;

use axum::Router;
use axum::routing::{get, post, put};

pub fn routes() -> Router {
    Router::new()
        // Écrire.
        .route("/ecritoire", get(ecritoire::lire))
        .route("/brouillons", post(ecritoire::commencer))
        .route(
            "/brouillons/{id}",
            get(ecritoire::lire_brouillon)
                .put(ecritoire::enregistrer)
                .delete(ecritoire::jeter),
        )
        .route("/brouillons/{id}/envoi", post(ecritoire::envoyer))
        // Recevoir.
        .route("/reception", get(courrier::reception))
        .route("/plis/{id}", get(courrier::lire).delete(courrier::detruire))
        .route("/plis/{id}/ouverture", post(courrier::ouvrir))
        .route("/plis/{id}/dossier", put(courrier::ranger))
        .route("/rangement", put(courrier::ranger_plusieurs))
        .route("/destruction", post(courrier::detruire_plusieurs))
        .route("/dossiers", post(dossiers::creer))
        .route(
            "/dossiers/{id}",
            get(dossiers::lire)
                .put(dossiers::renommer)
                .delete(dossiers::supprimer),
        )
        // Le personnage.
        .route("/fiche", get(fiche::lire))
}
