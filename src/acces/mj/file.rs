//! La file du MJ : les lettres envoyées par les joueurs, en attente de sa décision.
//!
//! Traiter une lettre, c'est décider de son sort : à qui elle va, quand, et si des tiers
//! en reçoivent une copie. C'est à ce moment que ses exemplaires sont créés.
//!
//! Une lettre adressée à un PNJ reste dans la file tant que le MJ n'y a pas répondu,
//! ou ne l'a pas classée sans réponse.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;
use uuid::Uuid;

use super::acheminement::{
    MINUTES_DE_RATTRAPAGE, SceauPose, noter, origine_pour, poser_exemplaire,
};
use super::plume::{self, BilletPnj};
use crate::acces::Mj;
use crate::base;
use crate::erreur::Erreur;
use crate::modele::{
    Acheminement, EtatPli, GenreDestinataire, GenrePersonnage, OrigineExemplaire,
};

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export)]
pub struct FileMj {
    /// Les lettres en attente, la plus urgente en premier : celle dont la date de
    /// livraison proposée est la plus proche.
    pub lettres: Vec<LettreATraiter>,
    /// Les lettres mises de côté. Elles peuvent revenir dans la file.
    pub ecartees: Vec<LettreATraiter>,
}

/// Une lettre de joueur, dans sa version originale.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct LettreATraiter {
    pub id: Uuid,
    pub auteur_id: Uuid,
    pub auteur_nom: String,
    /// La police de l'écriture de l'auteur, s'il en a une.
    pub police: Option<String>,
    pub texte: String,
    pub signe: bool,
    pub sceau: Option<SceauPose>,
    pub destinataire: DestinataireVise,
    pub envoye_le: DateTime<Utc>,
    /// La date de livraison que le site propose.
    pub date_proposee: DateTime<Utc>,
    /// La date proposée est passée : à la validation, le site en proposera une nouvelle.
    pub date_depassee: bool,
}

/// À qui l'auteur adresse sa lettre.
#[derive(Serialize, TS)]
#[serde(tag = "genre", rename_all = "snake_case")]
#[ts(export)]
pub enum DestinataireVise {
    Personnage { id: Uuid, nom: String, pnj: bool },
    Gazette,
    /// Une adresse écrite librement, que le MJ interprète.
    Libre { adresse: String },
}

/// Ce qu'il advient de l'exemplaire du destinataire.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Decision {
    Livrer,
    /// Mis de côté par le MJ, qui pourra le remettre en route.
    Retenir,
    /// Il n'arrivera pas.
    Perdre,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct Traitement {
    /// À qui va la lettre. Vide : au personnage que vise l'auteur.
    pub destinataire_id: Option<Uuid>,
    pub decision: Decision,
    /// Vide : la date proposée par le site.
    pub livraison_le: Option<DateTime<Utc>>,
    /// Les tiers qui en reçoivent une copie.
    pub copies: Vec<Uuid>,
    /// La réponse du PNJ qui reçoit la lettre, écrite dans la foulée.
    pub reponse: Option<BilletPnj>,
}

// ---------------------------------------------------------------------------
// Les traitements
// ---------------------------------------------------------------------------

pub async fn lister(_mj: Mj) -> Result<Json<FileMj>, Erreur> {
    let pool = base::pool().await?;
    let lignes = sqlx::query!(
        r#"
        select
            p.id,
            p.auteur_id as "auteur_id!",
            a.nom as auteur_nom,
            e.police as "police?",
            coalesce(p.contenu->>'texte', '') as "texte!",
            p.signe,
            s.nom_grave as "sceau_nom?",
            s.initiales as "sceau_initiales?",
            s.image_url as "sceau_image?",
            p.destinataire_genre as "genre: GenreDestinataire",
            p.destinataire_id,
            d.nom as "destinataire_nom?",
            d.genre as "destinataire_genre?: GenrePersonnage",
            p.destinataire_libre,
            p.etat as "etat: EtatPli",
            p.envoye_le as "envoye_le!",
            coalesce(p.date_proposee, p.envoye_le) as "date_proposee!",
            coalesce(p.date_proposee <= now(), true) as "date_depassee!"
        from plis p
        join personnages a on a.id = p.auteur_id
        left join ecritures e on e.id = a.ecriture_id
        left join sceaux s on s.id = p.sceau_id
        left join personnages d on d.id = p.destinataire_id
        where p.etat in ('a_traiter', 'ecarte') and not p.redige_par_mj
        order by p.date_proposee nulls first, p.envoye_le
        "#
    )
    .fetch_all(pool)
    .await?;

    let mut file = FileMj {
        lettres: Vec::new(),
        ecartees: Vec::new(),
    };
    for ligne in lignes {
        let destinataire = match (
            ligne.genre,
            ligne.destinataire_id,
            ligne.destinataire_nom,
            ligne.destinataire_libre,
        ) {
            (Some(GenreDestinataire::Personnage), Some(id), Some(nom), _) => {
                DestinataireVise::Personnage {
                    id,
                    nom,
                    pnj: ligne.destinataire_genre == Some(GenrePersonnage::Pnj),
                }
            }
            (Some(GenreDestinataire::Libre), _, _, Some(adresse)) => {
                DestinataireVise::Libre { adresse }
            }
            _ => DestinataireVise::Gazette,
        };
        let lettre = LettreATraiter {
            id: ligne.id,
            auteur_id: ligne.auteur_id,
            auteur_nom: ligne.auteur_nom,
            police: ligne.police,
            texte: ligne.texte,
            signe: ligne.signe,
            sceau: SceauPose::depuis(ligne.sceau_nom, ligne.sceau_initiales, ligne.sceau_image),
            destinataire,
            envoye_le: ligne.envoye_le,
            date_proposee: ligne.date_proposee,
            date_depassee: ligne.date_depassee,
        };
        if ligne.etat == EtatPli::Ecarte {
            file.ecartees.push(lettre);
        } else {
            file.lettres.push(lettre);
        }
    }
    Ok(Json(file))
}

/// Décide du sort d'une lettre : ses exemplaires sont créés, et elle quitte la file.
pub async fn traiter(
    mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<Traitement>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // Le verrou empêche de traiter deux fois la même lettre. La date retenue est celle
    // que choisit le MJ ; sinon la date proposée ; et si elle est passée, une date proche.
    let pli = sqlx::query!(
        r#"
        select
            p.auteur_id,
            p.destinataire_genre as "genre: GenreDestinataire",
            p.destinataire_id,
            case
                when $2::timestamptz is not null then greatest($2::timestamptz, now())
                when p.date_proposee > now() then p.date_proposee
                else now() + make_interval(mins => $3)
            end as "livraison_le!"
        from plis p
        where p.id = $1 and p.etat = 'a_traiter'
        for update
        "#,
        id,
        saisie.livraison_le,
        MINUTES_DE_RATTRAPAGE,
    )
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;

    let destinataire_id = saisie
        .destinataire_id
        .or(pli.destinataire_id)
        .ok_or(Erreur::Refus("Choisissez d'abord à qui va cette lettre."))?;

    let mut copies = saisie.copies;
    copies.sort();
    copies.dedup();
    if copies.contains(&destinataire_id) {
        return Err(Erreur::Refus(
            "Le destinataire reçoit déjà cette lettre : une copie est pour quelqu'un d'autre.",
        ));
    }

    let acheminement = match saisie.decision {
        Decision::Livrer => Acheminement::EnRoute,
        Decision::Retenir => Acheminement::Retenu,
        Decision::Perdre => Acheminement::Perdu,
    };
    let exemplaire_id = poser_exemplaire(
        &mut transaction,
        id,
        destinataire_id,
        origine_pour(pli.genre, pli.destinataire_id, destinataire_id),
        acheminement,
        pli.livraison_le,
    )
    .await?;

    // Les copies partent même si l'exemplaire du destinataire est retenu ou perdu.
    for copie in &copies {
        poser_exemplaire(
            &mut transaction,
            id,
            *copie,
            OrigineExemplaire::Copie,
            Acheminement::EnRoute,
            pli.livraison_le,
        )
        .await?;
    }

    sqlx::query!(
        "update plis set etat = 'traite', modifie_le = now() where id = $1",
        id,
    )
    .execute(&mut *transaction)
    .await?;

    noter(
        &mut transaction,
        &mj,
        id,
        Some(exemplaire_id),
        "traitement",
        json!({
            "decision": saisie.decision,
            "destinataire_id": destinataire_id,
            "livraison_le": pli.livraison_le,
            "copies": copies,
        }),
    )
    .await?;

    // La réponse du PNJ part dans le même geste : si elle est refusée, rien n'est traité.
    if let Some(reponse) = saisie.reponse {
        if saisie.decision != Decision::Livrer {
            return Err(Erreur::Refus(
                "Un PNJ ne répond qu'à une lettre qu'il a reçue.",
            ));
        }
        let auteur_id = pli
            .auteur_id
            .ok_or(Erreur::Refus("Cette lettre n'a pas d'auteur à qui répondre."))?;
        plume::rediger(&mut transaction, &mj, destinataire_id, auteur_id, reponse).await?;
    }

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Met de côté une lettre qui n'a pas de destinataire précis : adressée à la gazette,
/// ou à une adresse libre restée sans suite. Elle peut revenir dans la file.
pub async fn ecarter(mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    changer_etat(mj, id, EtatPli::ATraiter, EtatPli::Ecarte, "ecart").await
}

/// Remet dans la file une lettre écartée.
pub async fn reprendre(mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    changer_etat(mj, id, EtatPli::Ecarte, EtatPli::ATraiter, "retour_en_file").await
}

async fn changer_etat(
    mj: Mj,
    id: Uuid,
    avant: EtatPli,
    apres: EtatPli,
    evenement: &str,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    let change = sqlx::query!(
        r#"
        update plis
        set etat = $3, modifie_le = now()
        where id = $1 and etat = $2
          and not redige_par_mj
          and destinataire_genre in ('gazette', 'libre')
        "#,
        id,
        avant as EtatPli,
        apres as EtatPli,
    )
    .execute(&mut *transaction)
    .await?;
    if change.rows_affected() == 0 {
        return Err(Erreur::Refus(
            "Cette lettre n'est plus là, ou elle a un destinataire précis : perdez-la plutôt.",
        ));
    }

    noter(&mut transaction, &mj, id, None, evenement, json!({})).await?;
    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
