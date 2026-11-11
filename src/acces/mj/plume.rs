//! La plume du MJ : écrire au nom d'un PNJ.
//!
//! Une lettre de PNJ suit les règles des joueurs : un billet, une écriture, une signature
//! et un sceau facultatifs. Elle ne passe pas par la file : elle part aussitôt, et reste
//! modifiable dans l'écran En route jusqu'à son arrivée.

use axum::Json;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::Deserialize;
use serde_json::json;
use sqlx::{Postgres, Transaction};
use ts_rs::TS;
use uuid::Uuid;

use super::acheminement::{REFUS_PERSONNAGE, noter, poser_exemplaire};
use crate::acces::Mj;
use crate::base;
use crate::erreur::{Erreur, refus_de_la_base};
use crate::modele::{Acheminement, GenrePersonnage, OrigineExemplaire};

/// Le MJ peut dépasser la longueur d'un billet de joueur, mais pas sans fin.
const LONGUEUR_MAX: usize = 20_000;

/// Ce que le MJ écrit sur le billet d'un PNJ.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct BilletPnj {
    /// L'écriture à donner au PNJ s'il n'en a pas encore. Elle devient la sienne.
    pub ecriture_id: Option<Uuid>,
    pub texte: String,
    pub signe: bool,
    /// Un sceau que le PNJ détient. Vide : le pli part sans sceau.
    pub sceau_id: Option<Uuid>,
    /// Vide : le site applique le délai habituel, plus ou moins le hasard.
    pub livraison_le: Option<DateTime<Utc>>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct LettrePnj {
    /// Le PNJ au nom de qui le MJ écrit.
    pub auteur_id: Uuid,
    pub destinataire_id: Uuid,
    pub billet: BilletPnj,
}

pub async fn ecrire(mj: Mj, Json(saisie): Json<LettrePnj>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;
    rediger(
        &mut transaction,
        &mj,
        saisie.auteur_id,
        saisie.destinataire_id,
        saisie.billet,
    )
    .await?;
    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Écrit le billet d'un PNJ et le met en route. Sert aussi à la réponse donnée depuis la file.
pub(super) async fn rediger(
    transaction: &mut Transaction<'_, Postgres>,
    mj: &Mj,
    auteur_id: Uuid,
    destinataire_id: Uuid,
    billet: BilletPnj,
) -> Result<Uuid, Erreur> {
    let texte = billet.texte.trim();
    if texte.is_empty() {
        return Err(Erreur::Refus("Ce billet est vide."));
    }
    if texte.chars().count() > LONGUEUR_MAX {
        return Err(Erreur::Refus("Ce texte est bien trop long pour un billet."));
    }
    if auteur_id == destinataire_id {
        return Err(Erreur::Refus("Un personnage ne s'écrit pas à lui-même."));
    }

    let auteur = sqlx::query!(
        r#"
        select genre as "genre: GenrePersonnage", ecriture_id
        from personnages where id = $1 for update
        "#,
        auteur_id,
    )
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(REFUS_PERSONNAGE)?;
    if auteur.genre != GenrePersonnage::Pnj {
        return Err(Erreur::Refus("Vous n'écrivez qu'au nom d'un PNJ."));
    }

    // Un PNJ sans écriture reçoit celle qui est choisie ici, et la garde :
    // sa main reste ainsi un indice fiable d'une lettre à l'autre.
    if auteur.ecriture_id.is_none() {
        let ecriture_id = billet
            .ecriture_id
            .ok_or(Erreur::Refus("Choisissez l'écriture de ce PNJ."))?;
        sqlx::query!(
            "update personnages set ecriture_id = $2 where id = $1",
            auteur_id,
            ecriture_id,
        )
        .execute(&mut **transaction)
        .await
        .map_err(refus_de_la_base("", "Cette écriture n'existe pas."))?;
    }

    if let Some(sceau_id) = billet.sceau_id {
        let detenu = sqlx::query_scalar!(
            r#"
            select exists (
                select 1 from sceaux where id = $1 and detenteur_id = $2
            ) as "detenu!"
            "#,
            sceau_id,
            auteur_id,
        )
        .fetch_one(&mut **transaction)
        .await?;
        if !detenu {
            return Err(Erreur::Refus("Ce PNJ ne détient pas ce sceau."));
        }
    }

    // Sans date choisie : le délai habituel, plus ou moins le hasard.
    let reglages = sqlx::query!("select delai_minutes, hasard_minutes from reglages")
        .fetch_one(&mut **transaction)
        .await?;
    let hasard = rand::rng().random_range(-reglages.hasard_minutes..=reglages.hasard_minutes);
    let delai = (reglages.delai_minutes + hasard).max(0);

    let pli = sqlx::query!(
        r#"
        insert into plis (
            auteur_id, redige_par_mj, gabarit, destinataire_genre, destinataire_id,
            contenu, sceau_id, signe, etat, envoye_le, date_proposee
        )
        values (
            $1, true, 'billet', 'personnage', $2,
            jsonb_build_object('texte', $3::text), $4, $5, 'traite', now(),
            -- « greatest » ignore une date vide : le cas se traite donc à part.
            case
                when $6::timestamptz is null then now() + make_interval(mins => $7)
                else greatest($6::timestamptz, now())
            end
        )
        returning id, date_proposee as "livraison_le!"
        "#,
        auteur_id,
        destinataire_id,
        texte,
        billet.sceau_id,
        billet.signe,
        billet.livraison_le,
        delai,
    )
    .fetch_one(&mut **transaction)
    .await
    .map_err(refus_de_la_base("", "Ce personnage n'existe pas."))?;

    let exemplaire_id = poser_exemplaire(
        transaction,
        pli.id,
        destinataire_id,
        OrigineExemplaire::Destinataire,
        Acheminement::EnRoute,
        pli.livraison_le,
    )
    .await?;

    noter(
        transaction,
        mj,
        pli.id,
        Some(exemplaire_id),
        "envoi",
        json!({ "au_nom_de": auteur_id, "livraison_le": pli.livraison_le }),
    )
    .await?;

    Ok(pli.id)
}
