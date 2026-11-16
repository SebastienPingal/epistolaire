//! Les images : celles des documents (cartes, illustrations) et celles des sceaux.
//!
//! Le fichier est dans le stockage Vercel Blob, en accès privé ; la table `images` n'en
//! garde que la fiche. Aucune image n'a d'adresse publique : le site la sert lui-même.
//!
//! Règles de ce fichier :
//!
//! * [`servir`] ne vérifie rien : c'est à la porte qui l'appelle (celle du MJ, ou celle des
//!   joueurs) de s'assurer d'abord que la personne a le droit de voir cette image ;
//! * ni le chemin ni l'adresse du fichier dans le stockage ne sortent d'ici ;
//! * seules de vraies images sont acceptées, reconnues à leurs premiers octets, jamais au
//!   type annoncé par le navigateur. Pas de SVG : il peut contenir du code.

use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE, HeaderName};
use axum::response::{IntoResponse, Response};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use crate::erreur::Erreur;
use crate::sauvegarde::blob::{Blob, REFUS_NON_CONFIGURE};

/// La taille d'une image : Vercel refuse les envois de plus de 4,5 Mo.
pub const TAILLE_MAX: usize = 4 * 1024 * 1024;
/// Le plus grand côté accepté, en pixels. L'interface réduit à 2 000 avant d'envoyer.
const COTE_MAX: i32 = 10_000;

/// Le dossier des images dans le stockage.
const DOSSIER: &str = "images/";

/// La fiche d'une image, telle que le MJ la voit.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct ImageMj {
    pub id: Uuid,
    pub type_mime: String,
    /// En octets.
    pub taille: i32,
    pub largeur: i32,
    pub hauteur: i32,
    pub cree_le: DateTime<Utc>,
}

/// Le type d'une image, reconnu à ses premiers octets. `None` : ce n'en est pas une.
fn type_de(octets: &[u8]) -> Option<(&'static str, &'static str)> {
    if octets.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some(("image/png", "png"))
    } else if octets.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("image/jpeg", "jpg"))
    } else if octets.starts_with(b"GIF87a") || octets.starts_with(b"GIF89a") {
        Some(("image/gif", "gif"))
    } else if octets.len() >= 12 && &octets[..4] == b"RIFF" && &octets[8..12] == b"WEBP" {
        Some(("image/webp", "webp"))
    } else {
        None
    }
}

/// Range une image : le fichier dans le stockage, sa fiche dans la base.
pub async fn ranger(
    pool: &PgPool,
    octets: Vec<u8>,
    largeur: i32,
    hauteur: i32,
) -> Result<ImageMj, Erreur> {
    if octets.is_empty() {
        return Err(Erreur::Refus("Ce fichier est vide."));
    }
    if octets.len() > TAILLE_MAX {
        return Err(Erreur::Refus("Cette image est trop lourde : 4 Mo au plus."));
    }
    let (type_mime, extension) = type_de(&octets).ok_or(Erreur::Refus(
        "Ce fichier n'est pas une image reconnue : PNG, JPEG, WebP ou GIF.",
    ))?;
    if !(1..=COTE_MAX).contains(&largeur) || !(1..=COTE_MAX).contains(&hauteur) {
        return Err(Erreur::Refus("Les dimensions de cette image sont inattendues."));
    }
    let blob = Blob::depuis_l_environnement()?.ok_or(REFUS_NON_CONFIGURE)?;

    let id = Uuid::now_v7();
    let taille = octets.len() as i32;
    let depot = blob
        .deposer(&format!("{DOSSIER}{id}.{extension}"), octets, type_mime)
        .await?;

    let image = sqlx::query_as!(
        ImageMj,
        r#"
        insert into images (id, chemin_blob, url_blob, type_mime, taille, largeur, hauteur)
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id, type_mime, taille, largeur, hauteur, cree_le
        "#,
        id,
        depot.pathname,
        depot.url,
        type_mime,
        taille,
        largeur,
        hauteur,
    )
    .fetch_one(pool)
    .await?;
    Ok(image)
}

/// Les images existent-elles toutes ?
pub async fn existent<'e>(
    executeur: impl sqlx::PgExecutor<'e>,
    ids: &[Uuid],
) -> Result<bool, Erreur> {
    if ids.is_empty() {
        return Ok(true);
    }
    let trouvees = sqlx::query_scalar!(
        r#"select count(*)::int as "nombre!" from images where id = any($1)"#,
        ids,
    )
    .fetch_one(executeur)
    .await?;
    let mut distinctes = ids.to_vec();
    distinctes.sort_unstable();
    distinctes.dedup();
    Ok(trouvees as usize == distinctes.len())
}

/// Sert une image : ses octets, son type, et rien d'autre.
///
/// Ne vérifie pas qui la demande : l'appelant l'a fait. La réponse est privée (aucun
/// serveur intermédiaire ne la garde), et le navigateur de la personne peut la garder
/// longtemps : une image ne change jamais, on en dépose une autre.
pub async fn servir(pool: &PgPool, id: Uuid) -> Result<Response, Erreur> {
    let image = sqlx::query!("select url_blob, type_mime from images where id = $1", id)
        .fetch_optional(pool)
        .await?
        .ok_or(Erreur::Introuvable)?;
    let blob = Blob::depuis_l_environnement()?.ok_or(REFUS_NON_CONFIGURE)?;
    let octets = blob.lire(&image.url_blob).await?;
    Ok((
        [
            (CONTENT_TYPE, image.type_mime),
            (CACHE_CONTROL, "private, max-age=31536000, immutable".to_owned()),
            // Le navigateur ne devine pas un autre type que celui annoncé.
            (HeaderName::from_static("x-content-type-options"), "nosniff".to_owned()),
        ],
        octets,
    )
        .into_response())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn les_images_se_reconnaissent_a_leurs_premiers_octets() {
        assert_eq!(
            type_de(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0]).map(|t| t.0),
            Some("image/png"),
        );
        assert_eq!(type_de(&[0xFF, 0xD8, 0xFF, 0xE0]).map(|t| t.0), Some("image/jpeg"));
        assert_eq!(type_de(b"GIF89a....").map(|t| t.0), Some("image/gif"));
        assert_eq!(type_de(b"RIFF\x10\x00\x00\x00WEBPVP8 ").map(|t| t.0), Some("image/webp"));
    }

    #[test]
    fn le_reste_est_refuse() {
        assert!(type_de(b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>").is_none());
        assert!(type_de(b"<html><script>alert(1)</script></html>").is_none());
        assert!(type_de(b"RIFF\x10\x00\x00\x00WAVEfmt ").is_none());
        assert!(type_de(b"").is_none());
    }
}
