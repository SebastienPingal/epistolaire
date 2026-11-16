//! Le filet de sécurité : une copie de toute la base, chaque jour, gardée 30 jours.
//!
//! * [`copie`] : lire la base et en faire un seul fichier compressé ;
//! * [`blob`] : le déposer dans le stockage Vercel Blob du projet, en accès privé
//!   (les copies contiennent les adresses e-mail des joueurs) ;
//! * [`restauration`] : remettre une copie dans une base neuve.
//!
//! La copie quotidienne est faite par la tâche planifiée `GET /api/taches/sauvegarde`
//! (`crate::taches`). Le MJ peut aussi en faire une, les lister et les télécharger
//! (`crate::acces::mj::sauvegardes`).
//!
//! Les copies s'appellent `sauvegardes/AAAA-MM-JJ-HHMMSS-mmm.json.gz`, à l'heure de Paris, à la
//! milliseconde près : la copie de 4 h et un clic du MJ ne tombent jamais sur le même nom, et
//! un nom déjà pris n'est jamais écrasé.
//! Après chaque copie réussie, celles de plus de 30 jours sont supprimées : le ménage ne
//! se fait jamais quand la copie du jour a échoué.

pub mod blob;
pub mod copie;
pub mod restauration;

use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::PgPool;
use ts_rs::TS;

use crate::erreur::Erreur;
use blob::{Blob, REFUS_NON_CONFIGURE};

/// Le dossier des copies, dans le stockage.
pub const DOSSIER: &str = "sauvegardes/";
const EXTENSION: &str = ".json.gz";
/// Une copie est gardée ce nombre de jours.
pub const JOURS_DE_GARDE: i64 = 30;

/// Une copie, telle que le MJ la voit dans ses réglages.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Sauvegarde {
    /// Le nom du fichier, sans le dossier : `2026-11-16-040012-345.json.gz`.
    pub nom: String,
    #[ts(type = "number")]
    pub taille: u64,
    pub faite_le: DateTime<Utc>,
}

/// Ce qu'une copie a donné.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct CopieFaite {
    pub nom: String,
    #[ts(type = "number")]
    pub taille: u64,
    /// Les copies de plus de 30 jours, supprimées dans la foulée.
    pub supprimees: u32,
}

/// Fait une copie de la base, la dépose, puis supprime les copies trop anciennes.
pub async fn faire(pool: &PgPool) -> Result<CopieFaite, Erreur> {
    let blob = Blob::depuis_l_environnement()?.ok_or(REFUS_NON_CONFIGURE)?;
    let copie = copie::copier(pool).await?;
    let nom = format!("{}{EXTENSION}", copie.horodatage);
    let taille = copie.octets.len() as u64;
    blob.deposer(&format!("{DOSSIER}{nom}"), copie.octets, "application/gzip")
        .await?;

    let limite = Utc::now() - Duration::days(JOURS_DE_GARDE);
    let anciennes: Vec<String> = blob
        .lister(DOSSIER)
        .await?
        .into_iter()
        .filter(|fichier| fichier.uploaded_at < limite)
        .map(|fichier| fichier.url)
        .collect();
    blob.supprimer(&anciennes).await?;

    Ok(CopieFaite {
        nom,
        taille,
        supprimees: anciennes.len() as u32,
    })
}

/// Les copies présentes, de la plus récente à la plus ancienne. `None` : le stockage
/// n'est pas relié au site.
pub async fn lister() -> Result<Option<Vec<Sauvegarde>>, Erreur> {
    let Some(blob) = Blob::depuis_l_environnement()? else {
        return Ok(None);
    };
    let mut copies: Vec<Sauvegarde> = blob
        .lister(DOSSIER)
        .await?
        .into_iter()
        .filter_map(|fichier| {
            let nom = fichier.pathname.strip_prefix(DOSSIER)?.to_owned();
            nom_valable(&nom).then_some(Sauvegarde {
                nom,
                taille: fichier.size,
                faite_le: fichier.uploaded_at,
            })
        })
        .collect();
    copies.sort_by(|a, b| b.faite_le.cmp(&a.faite_le));
    Ok(Some(copies))
}

/// Le contenu d'une copie, désignée par son nom. `None` : elle n'existe pas.
pub async fn lire(nom: &str) -> Result<Option<Vec<u8>>, Erreur> {
    if !nom_valable(nom) {
        return Ok(None);
    }
    let blob = Blob::depuis_l_environnement()?.ok_or(REFUS_NON_CONFIGURE)?;
    let chemin = format!("{DOSSIER}{nom}");
    let Some(fichier) = blob
        .lister(&chemin)
        .await?
        .into_iter()
        .find(|fichier| fichier.pathname == chemin)
    else {
        return Ok(None);
    };
    blob.lire(&fichier.url).await.map(Some)
}

/// Un nom de copie : des chiffres et des tirets, puis `.json.gz`. Rien d'autre ne
/// passe, pour qu'un nom ne désigne jamais un fichier hors du dossier des copies.
fn nom_valable(nom: &str) -> bool {
    nom.strip_suffix(EXTENSION).is_some_and(|horodatage| {
        !horodatage.is_empty()
            && horodatage.len() <= 40
            && horodatage.chars().all(|c| c.is_ascii_digit() || c == '-')
    })
}

#[cfg(test)]
mod tests {
    use super::nom_valable;

    #[test]
    fn noms_de_copie() {
        assert!(nom_valable("2026-11-16-040012-345.json.gz"));
        assert!(!nom_valable("../secret.json.gz"));
        assert!(!nom_valable("2026-11-16.json"));
        assert!(!nom_valable(".json.gz"));
        assert!(!nom_valable("2026/11.json.gz"));
    }
}
