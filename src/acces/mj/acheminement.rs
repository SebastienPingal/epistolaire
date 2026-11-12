//! Les rouages de l'acheminement, partagés par la file, l'écran En route et la plume du MJ :
//! créer l'exemplaire d'un destinataire, et tenir l'historique du pli.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use ts_rs::TS;
use uuid::Uuid;

use crate::acces::Mj;
use crate::erreur::Erreur;
use crate::modele::{Acheminement, GenreDestinataire, OrigineExemplaire};

/// Quand le MJ valide après la date proposée, le site en propose une nouvelle,
/// proche : ce nombre de minutes après la validation.
pub(super) const MINUTES_DE_RATTRAPAGE: i32 = 10;

pub(super) const REFUS_PERSONNAGE: Erreur = Erreur::Refus("Ce personnage n'existe pas.");

/// Le sceau qui ferme un pli, tel que le MJ le voit.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct SceauPose {
    pub nom_grave: String,
    pub initiales: String,
    pub image_url: Option<String>,
}

impl SceauPose {
    /// Un pli sans sceau n'a pas de nom gravé.
    pub(super) fn depuis(
        nom_grave: Option<String>,
        initiales: Option<String>,
        image_url: Option<String>,
    ) -> Option<Self> {
        nom_grave.map(|nom_grave| Self {
            nom_grave,
            initiales: initiales.unwrap_or_default(),
            image_url,
        })
    }
}

/// Pourquoi l'exemplaire principal d'un pli existe, selon ce que visait son auteur.
///
/// * une lettre à un personnage, remise à un autre : c'est une redirection ;
/// * une lettre à la gazette, remise à quelqu'un : aussi ;
/// * une adresse libre : le MJ l'interprète, celui qu'il désigne est le destinataire.
pub(super) fn origine_pour(
    genre: Option<GenreDestinataire>,
    vise: Option<Uuid>,
    effectif: Uuid,
) -> OrigineExemplaire {
    match genre {
        Some(GenreDestinataire::Personnage) if vise != Some(effectif) => {
            OrigineExemplaire::Redirection
        }
        Some(GenreDestinataire::Gazette) => OrigineExemplaire::Redirection,
        _ => OrigineExemplaire::Destinataire,
    }
}

/// Crée l'exemplaire d'un destinataire, dans la version que l'auteur a écrite.
/// Quand le pli est signé, l'exemplaire retient qui signe : c'est ce qui ajoutera
/// l'auteur au carnet du destinataire, à l'ouverture.
///
/// Un PNJ n'attend pas son courrier : c'est le MJ qui le lit pour lui. Son exemplaire
/// est donc arrivé et ouvert aussitôt, quelle que soit la date demandée.
pub(super) async fn poser_exemplaire(
    transaction: &mut Transaction<'_, Postgres>,
    pli_id: Uuid,
    destinataire_id: Uuid,
    origine: OrigineExemplaire,
    acheminement: Acheminement,
    livraison_le: DateTime<Utc>,
) -> Result<Uuid, Erreur> {
    sqlx::query_scalar!(
        r#"
        insert into exemplaires (
            pli_id, destinataire_id, origine,
            contenu, ecriture_id, sceau_id, sceau_etat,
            signature_nom, signature_ecriture_id, signature_etat, signature_personnage_id,
            acheminement, livraison_le, ouvert_le
        )
        select
            p.id, d.id, $3::text,
            p.contenu, a.ecriture_id, p.sceau_id,
            case when p.sceau_id is not null then 'intact' end,
            case when p.signe then a.nom end,
            case when p.signe then a.ecriture_id end,
            case when p.signe then 'intacte' else 'absente' end,
            case when p.signe then a.id end,
            $4::text,
            case when d.genre = 'pnj' then now() else $5::timestamptz end,
            case when d.genre = 'pnj' and $4::text = 'en_route' then now() end
        from plis p
        join personnages d on d.id = $2
        left join personnages a on a.id = p.auteur_id
        where p.id = $1
        returning id
        "#,
        pli_id,
        destinataire_id,
        origine as OrigineExemplaire,
        acheminement as Acheminement,
        livraison_le,
    )
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(REFUS_PERSONNAGE)
}

/// Ajoute une ligne à l'historique du pli. Rien n'y est jamais effacé.
pub(super) async fn noter(
    transaction: &mut Transaction<'_, Postgres>,
    mj: &Mj,
    pli_id: Uuid,
    exemplaire_id: Option<Uuid>,
    genre: &str,
    details: Value,
) -> Result<(), Erreur> {
    sqlx::query!(
        r#"
        insert into evenements (pli_id, exemplaire_id, compte_id, genre, details)
        values ($1, $2, $3, $4, $5)
        "#,
        pli_id,
        exemplaire_id,
        mj.compte_id(),
        genre,
        details,
    )
    .execute(&mut **transaction)
    .await?;
    Ok(())
}
