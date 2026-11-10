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

/// Traduit les refus de la base en messages lisibles : un doublon, ou une suppression
/// de quelque chose qui sert encore. Toute autre erreur reste une erreur interne.
pub fn refus_de_la_base(
    doublon: &'static str,
    encore_utilise: &'static str,
) -> impl Fn(sqlx::Error) -> Erreur {
    move |source| match source.as_database_error() {
        Some(erreur) if erreur.is_unique_violation() => Erreur::Refus(doublon),
        Some(erreur) if erreur.is_foreign_key_violation() => Erreur::Refus(encore_utilise),
        _ => Erreur::interne(source),
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
