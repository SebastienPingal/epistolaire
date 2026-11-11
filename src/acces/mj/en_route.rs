//! L'écran En route : les exemplaires qui ne sont pas encore arrivés.
//!
//! Tant qu'un exemplaire n'est pas livré, le MJ peut changer sa date, son destinataire,
//! le retenir, le perdre, le remettre en route, ou en faire partir une copie.
//! Une fois arrivé, il ne se modifie plus.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;
use uuid::Uuid;

use super::acheminement::{REFUS_PERSONNAGE, SceauPose, noter, origine_pour, poser_exemplaire};
use crate::acces::Mj;
use crate::base;
use crate::erreur::Erreur;
use crate::modele::{Acheminement, GenreDestinataire, OrigineExemplaire};

const REFUS_ARRIVE: Erreur =
    Erreur::Refus("Ce pli est déjà arrivé : il ne peut plus être modifié.");

/// Un personnage ne reçoit jamais deux exemplaires du même pli.
const REFUS_DEJA_SERVI: Erreur = Erreur::Refus("Ce personnage a déjà un exemplaire de ce pli.");

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export)]
pub struct EnRoute {
    /// Les exemplaires en chemin, le prochain à arriver en premier.
    pub en_route: Vec<ExemplaireMj>,
    pub retenus: Vec<ExemplaireMj>,
    pub perdus: Vec<ExemplaireMj>,
}

/// Un exemplaire pas encore arrivé, tel que le MJ le voit.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct ExemplaireMj {
    pub id: Uuid,
    pub pli_id: Uuid,
    /// Le vrai auteur du pli.
    pub auteur_nom: Option<String>,
    pub destinataire_id: Uuid,
    pub destinataire_nom: String,
    pub origine: OrigineExemplaire,
    pub acheminement: Acheminement,
    /// La date d'arrivée prévue. Un exemplaire retenu ou perdu garde celle qu'il avait.
    pub livraison_le: Option<DateTime<Utc>>,
    pub envoye_le: DateTime<Utc>,
    pub texte: String,
    /// La police de l'écriture du texte.
    pub police: Option<String>,
    pub signature: Option<String>,
    pub sceau: Option<SceauPose>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ExemplaireModifie {
    pub destinataire_id: Uuid,
    pub acheminement: Acheminement,
    /// Vide : la date ne change pas.
    pub livraison_le: Option<DateTime<Utc>>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct CopiePourTiers {
    pub destinataire_id: Uuid,
    /// Vide : la copie arrive en même temps que l'exemplaire copié.
    pub livraison_le: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------------------
// Les traitements
// ---------------------------------------------------------------------------

pub async fn lister(_mj: Mj) -> Result<Json<EnRoute>, Erreur> {
    let pool = base::pool().await?;
    let lignes = sqlx::query!(
        r#"
        select
            x.id,
            x.pli_id,
            a.nom as "auteur_nom?",
            x.destinataire_id,
            d.nom as destinataire_nom,
            x.origine as "origine: OrigineExemplaire",
            x.acheminement as "acheminement: Acheminement",
            x.livraison_le,
            p.envoye_le as "envoye_le!",
            coalesce(x.contenu->>'texte', '') as "texte!",
            e.police as "police?",
            case when x.signature_etat in ('intacte', 'contrefaite') then x.signature_nom end
                as "signature?",
            s.nom_grave as "sceau_nom?",
            s.initiales as "sceau_initiales?",
            s.image_url as "sceau_image?"
        from exemplaires x
        join plis p on p.id = x.pli_id
        join personnages d on d.id = x.destinataire_id
        left join personnages a on a.id = p.auteur_id
        left join ecritures e on e.id = x.ecriture_id
        left join sceaux s on s.id = x.sceau_id
        where x.acheminement <> 'en_route' or x.livraison_le > now()
        order by x.livraison_le nulls last, x.cree_le
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut ecran = EnRoute {
        en_route: Vec::new(),
        retenus: Vec::new(),
        perdus: Vec::new(),
    };
    for ligne in lignes {
        let exemplaire = ExemplaireMj {
            id: ligne.id,
            pli_id: ligne.pli_id,
            auteur_nom: ligne.auteur_nom,
            destinataire_id: ligne.destinataire_id,
            destinataire_nom: ligne.destinataire_nom,
            origine: ligne.origine,
            acheminement: ligne.acheminement,
            livraison_le: ligne.livraison_le,
            envoye_le: ligne.envoye_le,
            texte: ligne.texte,
            police: ligne.police,
            signature: ligne.signature,
            sceau: SceauPose::depuis(ligne.sceau_nom, ligne.sceau_initiales, ligne.sceau_image),
        };
        match exemplaire.acheminement {
            Acheminement::EnRoute => ecran.en_route.push(exemplaire),
            Acheminement::Retenu => ecran.retenus.push(exemplaire),
            Acheminement::Perdu => ecran.perdus.push(exemplaire),
        }
    }
    Ok(Json(ecran))
}

/// Change le destinataire, la date ou le sort d'un exemplaire qui n'est pas encore arrivé.
pub async fn modifier(
    mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<ExemplaireModifie>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    let actuel = sqlx::query!(
        r#"
        select
            x.pli_id,
            x.destinataire_id,
            x.origine as "origine: OrigineExemplaire",
            x.acheminement as "acheminement: Acheminement",
            x.livraison_le,
            (x.acheminement = 'en_route' and x.livraison_le <= now()) as "arrive!",
            p.destinataire_genre as "genre: GenreDestinataire",
            p.destinataire_id as vise_id,
            exists (
                select 1 from exemplaires autre
                where autre.pli_id = x.pli_id and autre.id <> x.id
                  and autre.destinataire_id = $2
            ) as "deja_servi!"
        from exemplaires x
        join plis p on p.id = x.pli_id
        where x.id = $1
        for update of x
        "#,
        id,
        saisie.destinataire_id,
    )
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;

    if actuel.arrive {
        return Err(REFUS_ARRIVE);
    }
    if actuel.deja_servi {
        return Err(REFUS_DEJA_SERVI);
    }
    if saisie.acheminement == Acheminement::EnRoute
        && saisie.livraison_le.is_none()
        && actuel.livraison_le.is_none()
    {
        return Err(Erreur::Refus("Un pli en route a une date de livraison."));
    }

    // Une copie reste une copie, à qui qu'elle aille.
    let origine = match actuel.origine {
        OrigineExemplaire::Copie => OrigineExemplaire::Copie,
        _ => origine_pour(actuel.genre, actuel.vise_id, saisie.destinataire_id),
    };

    // Remis à un PNJ, l'exemplaire est arrivé et lu aussitôt : c'est le MJ qui le lit.
    let modifie = sqlx::query!(
        r#"
        update exemplaires x
        set destinataire_id = d.id,
            origine = $3,
            acheminement = $4,
            livraison_le = case
                when d.genre = 'pnj' and $4::text = 'en_route' then now()
                when $4::text = 'en_route'
                    then greatest(coalesce($5::timestamptz, x.livraison_le), now())
                else coalesce($5::timestamptz, x.livraison_le)
            end,
            ouvert_le = case when d.genre = 'pnj' and $4::text = 'en_route' then now() end,
            modifie_le = now()
        from personnages d
        where x.id = $1 and d.id = $2
        "#,
        id,
        saisie.destinataire_id,
        origine as OrigineExemplaire,
        saisie.acheminement as Acheminement,
        saisie.livraison_le,
    )
    .execute(&mut *transaction)
    .await?;
    if modifie.rows_affected() == 0 {
        return Err(REFUS_PERSONNAGE);
    }

    noter(
        &mut transaction,
        &mj,
        actuel.pli_id,
        Some(id),
        "modification",
        json!({
            "avant": {
                "destinataire_id": actuel.destinataire_id,
                "acheminement": actuel.acheminement,
                "livraison_le": actuel.livraison_le,
            },
            "apres": {
                "destinataire_id": saisie.destinataire_id,
                "acheminement": saisie.acheminement,
                "livraison_le": saisie.livraison_le,
            },
        }),
    )
    .await?;

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Fait partir une copie du pli pour un tiers.
pub async fn copier(
    mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<CopiePourTiers>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    let source = sqlx::query!(
        r#"
        select
            x.pli_id,
            (x.acheminement = 'en_route' and x.livraison_le <= now()) as "arrive!",
            greatest(coalesce($2::timestamptz, x.livraison_le, now()), now()) as "livraison_le!",
            exists (
                select 1 from exemplaires autre
                where autre.pli_id = x.pli_id and autre.destinataire_id = $3
            ) as "deja_servi!"
        from exemplaires x
        where x.id = $1
        "#,
        id,
        saisie.livraison_le,
        saisie.destinataire_id,
    )
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;

    if source.arrive {
        return Err(REFUS_ARRIVE);
    }
    if source.deja_servi {
        return Err(REFUS_DEJA_SERVI);
    }

    let copie_id = poser_exemplaire(
        &mut transaction,
        source.pli_id,
        saisie.destinataire_id,
        OrigineExemplaire::Copie,
        Acheminement::EnRoute,
        source.livraison_le,
    )
    .await?;

    noter(
        &mut transaction,
        &mj,
        source.pli_id,
        Some(copie_id),
        "copie",
        json!({
            "destinataire_id": saisie.destinataire_id,
            "livraison_le": source.livraison_le,
        }),
    )
    .await?;

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
