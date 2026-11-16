//! L'outil unique du MJ : tout ce qu'il envoie est un document.
//!
//! Un gabarit, un expéditeur (un PNJ, ou personne), un contenu, une signature et un sceau
//! facultatifs, et un ou plusieurs destinataires, chacun avec sa date. Un billet écrit au
//! nom d'un PNJ n'est qu'un document parmi les autres.
//!
//! Règles de ce fichier :
//!
//! * un document ne passe pas par la file : il part aussitôt, et chaque exemplaire reste
//!   modifiable dans l'écran En route jusqu'à son arrivée ;
//! * un seul pli, et un exemplaire par destinataire, créé par `poser_exemplaire` ;
//! * la date par défaut (le délai habituel, plus ou moins le hasard) est tirée une fois et
//!   partagée par tous les destinataires qui n'ont pas la leur ;
//! * le MJ n'écrit qu'au nom d'un PNJ, ou de personne : jamais au nom d'un joueur ;
//! * une signature ou un sceau supposent un expéditeur. Seuls les gabarits écrits à la main
//!   se signent ; tout pli peut être scellé, d'un sceau que l'expéditeur détient ;
//! * les documents du MJ ne comptent dans aucun quota.

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
use crate::erreur::Erreur;
use crate::gabarits::Contenu;
use crate::images;
use crate::modele::{Acheminement, Gabarit, GenreDestinataire, GenrePersonnage, OrigineExemplaire};

/// Le nombre de destinataires d'un même document.
const DESTINATAIRES_MAX: usize = 50;

/// Un document, tel que le MJ le compose.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct DocumentSaisi {
    /// Le PNJ ou l'institution au nom de qui le MJ écrit. Vide : aucun expéditeur.
    pub auteur_id: Option<Uuid>,
    /// Le gabarit et ses cases.
    pub contenu: Contenu,
    pub signe: bool,
    /// Un sceau que l'expéditeur détient. Vide : le pli part sans sceau.
    pub sceau_id: Option<Uuid>,
    /// Pour un gabarit écrit à la main : l'écriture à donner au PNJ s'il n'en a pas encore
    /// (elle devient la sienne), ou l'écriture d'un document sans expéditeur.
    pub ecriture_id: Option<Uuid>,
    /// Chacun reçoit son exemplaire.
    pub destinataires: Vec<DestinataireDocument>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct DestinataireDocument {
    pub personnage_id: Uuid,
    /// Vide : la date commune (le délai habituel, plus ou moins le hasard).
    /// Une date passée vaut « tout de suite ».
    pub livraison_le: Option<DateTime<Utc>>,
}

pub async fn envoyer(mj: Mj, Json(saisie): Json<DocumentSaisi>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;
    rediger(&mut transaction, &mj, saisie).await?;
    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Écrit un document et met en route un exemplaire par destinataire.
/// Sert aussi à la réponse d'un PNJ donnée depuis la file.
pub(super) async fn rediger(
    transaction: &mut Transaction<'_, Postgres>,
    mj: &Mj,
    saisie: DocumentSaisi,
) -> Result<Uuid, Erreur> {
    let contenu = saisie.contenu.nettoye();
    contenu.valider()?;
    let gabarit = contenu.gabarit();
    if !images::existent(&mut **transaction, &contenu.images()).await? {
        return Err(Erreur::Refus("L'image de ce document n'existe pas."));
    }

    // Les destinataires : au moins un, chacun une seule fois.
    if saisie.destinataires.is_empty() {
        return Err(Erreur::Refus("Choisissez au moins un destinataire."));
    }
    if saisie.destinataires.len() > DESTINATAIRES_MAX {
        return Err(Erreur::Refus("Ce document a trop de destinataires."));
    }
    let mut vus: Vec<Uuid> = saisie
        .destinataires
        .iter()
        .map(|destinataire| destinataire.personnage_id)
        .collect();
    vus.sort_unstable();
    vus.dedup();
    if vus.len() != saisie.destinataires.len() {
        return Err(Erreur::Refus(
            "Un personnage ne reçoit jamais deux exemplaires du même pli.",
        ));
    }
    if saisie.auteur_id.is_some_and(|auteur_id| vus.contains(&auteur_id)) {
        return Err(Erreur::Refus("Un personnage ne s'écrit pas à lui-même."));
    }

    if saisie.signe && !gabarit.se_signe() {
        return Err(Erreur::Refus("Ce gabarit ne porte pas de signature."));
    }

    // L'expéditeur, et l'écriture d'un document écrit à la main.
    let mut ecriture_du_pli = None;
    match saisie.auteur_id {
        Some(auteur_id) => {
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
            if auteur.ecriture_id.is_none() && gabarit.est_manuscrit() {
                let ecriture_id = saisie
                    .ecriture_id
                    .ok_or(Erreur::Refus("Choisissez l'écriture de ce PNJ."))?;
                ecriture_d_un_pnj(transaction, ecriture_id).await?;
                sqlx::query!(
                    "update personnages set ecriture_id = $2 where id = $1",
                    auteur_id,
                    ecriture_id,
                )
                .execute(&mut **transaction)
                .await?;
            }

            if let Some(sceau_id) = saisie.sceau_id {
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
        }
        None => {
            if saisie.signe || saisie.sceau_id.is_some() {
                return Err(Erreur::Refus(
                    "Un document sans expéditeur n'a ni signature ni sceau.",
                ));
            }
            if gabarit.est_manuscrit() {
                let ecriture_id = saisie
                    .ecriture_id
                    .ok_or(Erreur::Refus("Choisissez l'écriture de ce document."))?;
                ecriture_d_un_pnj(transaction, ecriture_id).await?;
                ecriture_du_pli = Some(ecriture_id);
            }
        }
    }

    // Sans date choisie : le délai habituel, plus ou moins le hasard, tiré une seule fois.
    let reglages = sqlx::query!("select delai_minutes, hasard_minutes from reglages")
        .fetch_one(&mut **transaction)
        .await?;
    let hasard = rand::rng().random_range(-reglages.hasard_minutes..=reglages.hasard_minutes);
    let delai = (reglages.delai_minutes + hasard).max(0);

    // Avec un seul destinataire, le pli le vise, comme une lettre ordinaire : le rediriger
    // depuis En route se verra. Avec plusieurs, il ne vise personne en particulier.
    let seul = match vus.as_slice() {
        [seul] => Some(*seul),
        _ => None,
    };
    let pli = sqlx::query!(
        r#"
        insert into plis (
            auteur_id, redige_par_mj, gabarit, destinataire_genre, destinataire_id,
            contenu, sceau_id, signe, ecriture_id, etat, envoye_le, date_proposee
        )
        values (
            $1, true, $2, $3, $4, $5, $6, $7, $8, 'traite', now(),
            now() + make_interval(mins => $9)
        )
        returning id, envoye_le as "envoye_le!", date_proposee as "date_commune!"
        "#,
        saisie.auteur_id,
        gabarit as Gabarit,
        seul.map(|_| GenreDestinataire::Personnage) as Option<GenreDestinataire>,
        seul,
        contenu.cases(),
        saisie.sceau_id,
        saisie.signe,
        ecriture_du_pli,
        delai,
    )
    .fetch_one(&mut **transaction)
    .await
    .map_err(|source| match source.as_database_error() {
        Some(erreur) if erreur.is_foreign_key_violation() => REFUS_PERSONNAGE,
        _ => Erreur::interne(source),
    })?;

    let mut livraisons = Vec::with_capacity(saisie.destinataires.len());
    for destinataire in &saisie.destinataires {
        // Une date passée vaut « tout de suite ».
        let livraison_le = destinataire
            .livraison_le
            .map_or(pli.date_commune, |date| date.max(pli.envoye_le));
        poser_exemplaire(
            transaction,
            pli.id,
            destinataire.personnage_id,
            OrigineExemplaire::Destinataire,
            Acheminement::EnRoute,
            livraison_le,
        )
        .await?;
        livraisons.push(json!({
            "personnage_id": destinataire.personnage_id,
            "livraison_le": livraison_le,
        }));
    }

    noter(
        transaction,
        mj,
        pli.id,
        None,
        "envoi",
        json!({
            "au_nom_de": saisie.auteur_id,
            "gabarit": gabarit,
            "destinataires": livraisons,
        }),
    )
    .await?;

    Ok(pli.id)
}

/// Vérifie qu'une écriture peut être celle d'un PNJ ou d'un document sans expéditeur :
/// elle existe, et ce n'est pas celle d'un joueur. La main d'un joueur reste un indice,
/// et le MJ n'écrit pas à sa place.
async fn ecriture_d_un_pnj(
    transaction: &mut Transaction<'_, Postgres>,
    ecriture_id: Uuid,
) -> Result<(), Erreur> {
    let d_un_joueur = sqlx::query_scalar!(
        r#"
        select exists (
            select 1 from personnages where ecriture_id = e.id and genre = 'joueur'
        ) as "d_un_joueur!"
        from ecritures e
        where e.id = $1
        "#,
        ecriture_id,
    )
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(Erreur::Refus("Cette écriture n'existe pas."))?;
    if d_un_joueur {
        return Err(Erreur::Refus(
            "Cette écriture est celle d'un joueur : prenez-en une autre.",
        ));
    }
    Ok(())
}
