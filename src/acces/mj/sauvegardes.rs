//! Les sauvegardes, vues du MJ : la liste des copies, une copie faite sur-le-champ,
//! et le téléchargement d'une copie (décision du MJ, 16 novembre).
//!
//! Les copies contiennent toute la base, adresses e-mail comprises : seul le MJ y accède,
//! et le stockage est privé. Le téléchargement passe par le serveur, qui seul a le jeton.

use axum::Json;
use axum::extract::Path;
use axum::http::header::{CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use serde::Serialize;
use ts_rs::TS;

use super::super::Mj;
use crate::base;
use crate::erreur::Erreur;
use crate::sauvegarde::{self, CopieFaite, JOURS_DE_GARDE, Sauvegarde};

#[derive(Serialize, TS)]
#[ts(export)]
pub struct Sauvegardes {
    /// Faux si le stockage des copies n'est pas relié au site.
    pub configure: bool,
    /// De la plus récente à la plus ancienne.
    pub copies: Vec<Sauvegarde>,
    /// Combien de jours une copie est gardée.
    pub jours_de_garde: i32,
}

pub async fn lister(_: Mj) -> Result<Json<Sauvegardes>, Erreur> {
    let copies = sauvegarde::lister().await?;
    Ok(Json(Sauvegardes {
        configure: copies.is_some(),
        copies: copies.unwrap_or_default(),
        jours_de_garde: JOURS_DE_GARDE as i32,
    }))
}

/// « Faire une copie maintenant ».
pub async fn faire(_: Mj) -> Result<Json<CopieFaite>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(sauvegarde::faire(pool).await?))
}

/// Le fichier d'une copie, à enregistrer sur l'ordinateur du MJ.
pub async fn telecharger(_: Mj, Path(nom): Path<String>) -> Result<Response, Erreur> {
    let octets = sauvegarde::lire(&nom).await?.ok_or(Erreur::Introuvable)?;
    // Le nom a été vérifié par `sauvegarde::lire` : des chiffres, des tirets, `.json.gz`.
    let disposition = format!("attachment; filename=\"epistolaire-{nom}\"");
    Ok((
        [
            (CONTENT_TYPE, "application/gzip".to_owned()),
            (CONTENT_DISPOSITION, disposition),
            (CACHE_CONTROL, "no-store".to_owned()),
        ],
        octets,
    )
        .into_response())
}
