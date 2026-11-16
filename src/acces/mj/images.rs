//! Les images, vues du MJ : en déposer une, les revoir, en afficher une.
//!
//! Une image sert ensuite à une carte ou une illustration (l'outil Documents), ou à un
//! sceau (l'écran Sceaux). Le MJ voit toutes les images ; un joueur, seulement celles des
//! plis qu'il a ouverts et des sceaux qu'il voit : voir `src/acces/joueur/images.rs`.

use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, Query};
use axum::response::Response;
use serde::Deserialize;
use uuid::Uuid;

use crate::acces::Mj;
use crate::base;
use crate::erreur::Erreur;
use crate::images::{self, ImageMj};

/// Les dimensions de l'image, données par le navigateur qui vient de la préparer.
#[derive(Deserialize)]
pub struct Dimensions {
    pub largeur: i32,
    pub hauteur: i32,
}

/// Les images déposées, la plus récente en premier.
pub async fn lister(_mj: Mj) -> Result<Json<Vec<ImageMj>>, Erreur> {
    let pool = base::pool().await?;
    let images = sqlx::query_as!(
        ImageMj,
        r#"
        select id, type_mime, taille, largeur, hauteur, cree_le
        from images
        order by cree_le desc, id
        limit 200
        "#
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(images))
}

/// Dépose une image. Le corps de la requête est le fichier lui-même.
pub async fn deposer(
    _mj: Mj,
    Query(dimensions): Query<Dimensions>,
    octets: Bytes,
) -> Result<Json<ImageMj>, Erreur> {
    let pool = base::pool().await?;
    images::ranger(pool, octets.to_vec(), dimensions.largeur, dimensions.hauteur)
        .await
        .map(Json)
}

/// Le fichier d'une image.
pub async fn afficher(_mj: Mj, Path(id): Path<Uuid>) -> Result<Response, Erreur> {
    let pool = base::pool().await?;
    images::servir(pool, id).await
}
