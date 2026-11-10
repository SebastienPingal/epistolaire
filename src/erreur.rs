//! Les erreurs que le serveur renvoie à l'interface.
//!
//! Le détail d'une erreur interne reste dans les journaux du serveur :
//! l'interface n'en reçoit jamais le texte.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

#[derive(Debug)]
pub enum Erreur {
    /// Personne n'est connecté, ou la session a expiré.
    NonConnecte,
    /// Connecté, mais pas autorisé à faire ceci.
    Interdit,
    Introuvable,
    /// La demande est mal formée ou refusée. Le texte est montré à l'utilisateur.
    Refus(&'static str),
    /// Tout le reste : base injoignable, e-mail non parti…
    Interne(String),
}

impl Erreur {
    pub fn interne(source: impl std::fmt::Display) -> Self {
        Self::Interne(source.to_string())
    }
}

impl From<sqlx::Error> for Erreur {
    fn from(source: sqlx::Error) -> Self {
        Self::interne(source)
    }
}

impl IntoResponse for Erreur {
    fn into_response(self) -> Response {
        let (statut, code, message) = match self {
            Self::NonConnecte => (StatusCode::UNAUTHORIZED, "non_connecte", "Vous n'êtes pas connecté."),
            Self::Interdit => (StatusCode::FORBIDDEN, "interdit", "Ceci ne vous est pas permis."),
            Self::Introuvable => (StatusCode::NOT_FOUND, "introuvable", "Introuvable."),
            Self::Refus(message) => (StatusCode::BAD_REQUEST, "refus", message),
            Self::Interne(detail) => {
                eprintln!("erreur interne : {detail}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "interne",
                    "Quelque chose s'est mal passé. Réessayez dans un instant.",
                )
            }
        };

        (statut, Json(json!({ "erreur": code, "message": message }))).into_response()
    }
}
