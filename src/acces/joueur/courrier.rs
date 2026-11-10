//! Le courrier reçu par un joueur.
//!
//! Règle de ce fichier : le courrier ne se lit que dans la vue `plis_recus`, jamais dans
//! les tables `plis` et `exemplaires`, et toujours filtré sur le personnage du joueur.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use crate::acces::Joueur;
use crate::modele::{EtatSceau, Gabarit};

/// Un pli reçu, tel qu'il se présente fermé : on n'en voit que l'extérieur.
/// Le contenu n'est transmis qu'à l'ouverture.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct PliFerme {
    pub id: Uuid,
    pub gabarit: Gabarit,
    pub arrive_le: DateTime<Utc>,
    pub ouvert: bool,
    /// Le dossier où le joueur l'a rangé. Vide : la Réception.
    pub dossier_id: Option<Uuid>,
    /// Le sceau qui ferme le pli, s'il y en a un.
    pub sceau: Option<SceauVu>,
}

/// Un sceau tel qu'il se voit sur un pli.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct SceauVu {
    /// Le nom gravé : celui du propriétaire d'origine, même si le sceau a été volé.
    pub nom: String,
    pub initiales: String,
    pub image: Option<String>,
    /// Intact, sauf si le destinataire a remarqué quelque chose.
    pub etat: EtatSceau,
}

/// Tout le courrier arrivé d'un joueur, du plus récent au plus ancien.
pub async fn courrier(pool: &PgPool, joueur: &Joueur) -> Result<Vec<PliFerme>, sqlx::Error> {
    let lignes = sqlx::query!(
        r#"
        select
            id              as "id!",
            gabarit         as "gabarit!: Gabarit",
            arrive_le       as "arrive_le!",
            ouvert_le is not null as "ouvert!",
            dossier_id,
            sceau_nom,
            sceau_initiales,
            sceau_image,
            sceau_etat      as "sceau_etat: EtatSceau"
        from plis_recus
        where destinataire_id = $1
        order by arrive_le desc
        "#,
        joueur.personnage_id(),
    )
    .fetch_all(pool)
    .await?;

    Ok(lignes
        .into_iter()
        .map(|ligne| PliFerme {
            id: ligne.id,
            gabarit: ligne.gabarit,
            arrive_le: ligne.arrive_le,
            ouvert: ligne.ouvert,
            dossier_id: ligne.dossier_id,
            sceau: match (ligne.sceau_nom, ligne.sceau_etat) {
                (Some(nom), Some(etat)) => Some(SceauVu {
                    nom,
                    initiales: ligne.sceau_initiales.unwrap_or_default(),
                    image: ligne.sceau_image,
                    etat,
                }),
                _ => None,
            },
        })
        .collect())
}
