//! Le courrier reçu par un joueur : la Réception, l'ouverture, le rangement, la destruction.
//!
//! Règles de ce fichier :
//!
//! * le courrier ne se lit que dans la vue `plis_recus`, jamais dans les tables `plis` et
//!   `exemplaires`, et toujours filtré sur le personnage du joueur ;
//! * il ne se modifie que par les fonctions SQL `ouvrir_pli`, `ranger_pli` et `detruire_pli`,
//!   qui vérifient elles-mêmes que le pli est arrivé et qu'il est à ce joueur ;
//! * aucun horodatage de pli ne sort d'ici : seulement des dates du jeu ([`DateJeu`]).
//!   Le tri par heure d'arrivée se fait en SQL ;
//! * le contenu d'un pli ne part qu'une fois le pli ouvert.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction};
use ts_rs::TS;
use uuid::Uuid;

use super::dossiers::{Dossier, mes_dossiers};
use crate::acces::Joueur;
use crate::base;
use crate::calendrier::{Calendrier, DateJeu};
use crate::erreur::Erreur;
use crate::modele::{EtatSceau, Gabarit};

/// Nombre de plis qu'un seul geste peut ranger ou détruire.
const PLIS_PAR_GESTE: usize = 500;

/// Le début d'une lettre ouverte, montré dans les listes pour la reconnaître.
const LONGUEUR_DEBUT: i32 = 90;

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

/// La Réception : les plis qui ne sont rangés nulle part, et les dossiers du joueur.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Reception {
    /// Du plus récent au plus ancien.
    pub plis: Vec<PliFerme>,
    pub dossiers: Vec<Dossier>,
    /// Les plis pas encore ouverts, Réception et dossiers compris.
    pub non_ouverts: i32,
}

/// Un pli reçu, vu de l'extérieur. Tant qu'il est fermé, on n'en voit que le sceau
/// et la date d'arrivée ; une fois ouvert, aussi qui signe et les premiers mots,
/// pour le reconnaître dans une liste.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct PliFerme {
    pub id: Uuid,
    pub gabarit: Gabarit,
    /// Le jour d'arrivée, dans le calendrier du jeu. Jamais l'heure.
    pub arrive_le: DateJeu,
    pub ouvert: bool,
    /// Le dossier où le joueur l'a rangé. Vide : la Réception.
    pub dossier_id: Option<Uuid>,
    /// Le sceau qui ferme le pli, s'il y en a un.
    pub sceau: Option<SceauVu>,
    /// Le nom signé sous le texte. Seulement une fois le pli ouvert.
    pub signature: Option<String>,
    /// Les premiers mots. Seulement une fois le pli ouvert.
    pub debut: Option<String>,
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

/// Un pli : son extérieur, et son contenu s'il a été ouvert.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Pli {
    pub exterieur: PliFerme,
    /// Vide tant que le pli n'est pas ouvert : le contenu ne part qu'à l'ouverture.
    pub contenu: Option<ContenuPli>,
}

/// Ce qu'on lit une fois le pli ouvert.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct ContenuPli {
    /// Le jour où la lettre a été écrite, dans le calendrier du jeu.
    pub ecrit_le: DateJeu,
    pub texte: String,
    /// L'écriture du texte.
    pub police: Option<String>,
    pub signature: Option<SignatureVue>,
    /// Les passages réécrits que ce destinataire a remarqués. Vide sinon.
    pub passages_reecrits: Vec<Passage>,
    /// L'écriture de ces passages : celle du faussaire.
    pub police_reecriture: Option<String>,
}

/// Une signature, tracée dans sa propre écriture.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct SignatureVue {
    pub nom: String,
    pub police: Option<String>,
}

/// Un passage du texte, repéré par la position de ses caractères : du `debut` compris
/// à la `fin` non comprise. Les positions comptent les caractères, pas les octets.
#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Passage {
    pub debut: u32,
    pub fin: u32,
}

/// Où ranger un pli. Vide : la Réception.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct Destination {
    pub dossier_id: Option<Uuid>,
}

/// Ranger plusieurs plis d'un coup.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct Rangement {
    pub plis: Vec<Uuid>,
    /// Vide : la Réception.
    pub dossier_id: Option<Uuid>,
}

/// Détruire plusieurs plis d'un coup.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct Destruction {
    pub plis: Vec<Uuid>,
}

// ---------------------------------------------------------------------------
// Les lectures
// ---------------------------------------------------------------------------

pub async fn reception(joueur: Joueur) -> Result<Json<Reception>, Erreur> {
    let pool = base::pool().await?;
    let calendrier = Calendrier::lire(pool).await?;
    let moi = joueur.personnage_id();

    let non_ouverts = sqlx::query_scalar!(
        r#"
        select count(*)::int as "nombre!"
        from plis_recus
        where destinataire_id = $1 and ouvert_le is null
        "#,
        moi,
    )
    .fetch_one(pool)
    .await?;

    Ok(Json(Reception {
        plis: plis_du_dossier(pool, &joueur, &calendrier, None).await?,
        dossiers: mes_dossiers(pool, &joueur).await?,
        non_ouverts,
    }))
}

/// Les plis rangés à un endroit : un dossier, ou la Réception (`None`),
/// du plus récent au plus ancien.
pub(super) async fn plis_du_dossier(
    pool: &PgPool,
    joueur: &Joueur,
    calendrier: &Calendrier,
    dossier_id: Option<Uuid>,
) -> Result<Vec<PliFerme>, Erreur> {
    let lignes = sqlx::query!(
        r#"
        select
            r.id                                   as "id!",
            r.gabarit                              as "gabarit!: Gabarit",
            (r.arrive_le at time zone g.fuseau)::date as "arrive_jour!",
            r.ouvert_le is not null                as "ouvert!",
            r.dossier_id,
            r.sceau_nom,
            r.sceau_initiales,
            r.sceau_image,
            r.sceau_etat                           as "sceau_etat: EtatSceau",
            case when r.ouvert_le is not null then r.signature_nom end as "signature?",
            case when r.ouvert_le is not null then left(r.contenu->>'texte', $3) end
                                                   as "debut?"
        from plis_recus r
        cross join reglages g
        where r.destinataire_id = $1
          and r.dossier_id is not distinct from $2::uuid
        order by r.arrive_le desc, r.id
        "#,
        joueur.personnage_id(),
        dossier_id,
        LONGUEUR_DEBUT,
    )
    .fetch_all(pool)
    .await?;

    Ok(lignes
        .into_iter()
        .map(|ligne| PliFerme {
            id: ligne.id,
            gabarit: ligne.gabarit,
            arrive_le: calendrier.date(ligne.arrive_jour),
            ouvert: ligne.ouvert,
            dossier_id: ligne.dossier_id,
            sceau: sceau_vu(
                ligne.sceau_nom,
                ligne.sceau_initiales,
                ligne.sceau_image,
                ligne.sceau_etat,
            ),
            signature: ligne.signature,
            debut: ligne.debut,
        })
        .collect())
}

/// Un pli du joueur : son extérieur, et son contenu s'il est ouvert.
pub async fn lire(joueur: Joueur, Path(id): Path<Uuid>) -> Result<Json<Pli>, Erreur> {
    let pool = base::pool().await?;
    lire_pli(pool, &joueur, id).await.map(Json)
}

async fn lire_pli(pool: &PgPool, joueur: &Joueur, id: Uuid) -> Result<Pli, Erreur> {
    let calendrier = Calendrier::lire(pool).await?;
    let ligne = sqlx::query!(
        r#"
        select
            r.id                                   as "id!",
            r.gabarit                              as "gabarit!: Gabarit",
            (r.arrive_le at time zone g.fuseau)::date as "arrive_jour!",
            (r.ecrit_le at time zone g.fuseau)::date  as "ecrit_jour!",
            r.ouvert_le is not null                as "ouvert!",
            r.dossier_id,
            coalesce(r.contenu->>'texte', '')      as "texte!",
            texte.police                           as "police?",
            r.sceau_nom,
            r.sceau_initiales,
            r.sceau_image,
            r.sceau_etat                           as "sceau_etat: EtatSceau",
            r.signature_nom,
            signature.police                       as "signature_police?",
            r.passages_reecrits                    as "passages!: Value",
            reecriture.police                      as "police_reecriture?"
        from plis_recus r
        cross join reglages g
        left join ecritures texte on texte.id = r.ecriture_id
        left join ecritures signature on signature.id = r.signature_ecriture_id
        left join ecritures reecriture on reecriture.id = r.reecriture_ecriture_id
        where r.id = $1 and r.destinataire_id = $2
        "#,
        id,
        joueur.personnage_id(),
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;

    let contenu = ligne.ouvert.then(|| ContenuPli {
        ecrit_le: calendrier.date(ligne.ecrit_jour),
        texte: ligne.texte.clone(),
        police: ligne.police.clone(),
        signature: ligne.signature_nom.clone().map(|nom| SignatureVue {
            nom,
            police: ligne.signature_police.clone(),
        }),
        // Un passage mal formé ne doit pas empêcher de lire la lettre.
        passages_reecrits: serde_json::from_value(ligne.passages.clone()).unwrap_or_default(),
        police_reecriture: ligne.police_reecriture.clone(),
    });

    let debut = ligne
        .ouvert
        .then(|| ligne.texte.chars().take(LONGUEUR_DEBUT as usize).collect());

    Ok(Pli {
        exterieur: PliFerme {
            id: ligne.id,
            gabarit: ligne.gabarit,
            arrive_le: calendrier.date(ligne.arrive_jour),
            ouvert: ligne.ouvert,
            dossier_id: ligne.dossier_id,
            sceau: sceau_vu(
                ligne.sceau_nom,
                ligne.sceau_initiales,
                ligne.sceau_image,
                ligne.sceau_etat,
            ),
            signature: if ligne.ouvert { ligne.signature_nom } else { None },
            debut,
        },
        contenu,
    })
}

fn sceau_vu(
    nom: Option<String>,
    initiales: Option<String>,
    image: Option<String>,
    etat: Option<EtatSceau>,
) -> Option<SceauVu> {
    match (nom, etat) {
        (Some(nom), Some(etat)) => Some(SceauVu {
            nom,
            initiales: initiales.unwrap_or_default(),
            image,
            etat,
        }),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Les gestes
// ---------------------------------------------------------------------------

/// Ouvre un pli, et renvoie son contenu. Seule la première ouverture enrichit le carnet.
pub async fn ouvrir(joueur: Joueur, Path(id): Path<Uuid>) -> Result<Json<Pli>, Erreur> {
    let pool = base::pool().await?;
    let ouvert = sqlx::query_scalar!(
        r#"select ouvrir_pli($1, $2) as "ouvert!""#,
        id,
        joueur.personnage_id(),
    )
    .fetch_one(pool)
    .await?;
    if !ouvert {
        return Err(Erreur::Introuvable);
    }
    lire_pli(pool, &joueur, id).await.map(Json)
}

/// Range un pli dans un dossier du joueur, ou dans la Réception.
pub async fn ranger(
    joueur: Joueur,
    Path(id): Path<Uuid>,
    Json(destination): Json<Destination>,
) -> Result<StatusCode, Erreur> {
    ranger_plusieurs(
        joueur,
        Json(Rangement {
            plis: vec![id],
            dossier_id: destination.dossier_id,
        }),
    )
    .await
}

/// Range plusieurs plis d'un coup. Tout ou rien : si un seul pli ne peut pas l'être,
/// aucun ne bouge.
pub async fn ranger_plusieurs(
    joueur: Joueur,
    Json(rangement): Json<Rangement>,
) -> Result<StatusCode, Erreur> {
    let plis = plis_du_geste(rangement.plis)?;
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;
    for id in plis {
        let range = sqlx::query_scalar!(
            r#"select ranger_pli($1, $2, $3) as "range!""#,
            id,
            joueur.personnage_id(),
            rangement.dossier_id,
        )
        .fetch_one(&mut *transaction)
        .await?;
        if !range {
            return Err(Erreur::Introuvable);
        }
    }
    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Détruit un pli : il disparaît pour le joueur, mais le MJ le garde.
pub async fn detruire(joueur: Joueur, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    detruire_plusieurs(joueur, Json(Destruction { plis: vec![id] })).await
}

/// Détruit plusieurs plis d'un coup. Tout ou rien.
pub async fn detruire_plusieurs(
    joueur: Joueur,
    Json(destruction): Json<Destruction>,
) -> Result<StatusCode, Erreur> {
    let plis = plis_du_geste(destruction.plis)?;
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;
    for id in plis {
        if !detruire_pli(&mut transaction, &joueur, id).await? {
            return Err(Erreur::Introuvable);
        }
    }
    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(super) async fn detruire_pli(
    transaction: &mut Transaction<'_, Postgres>,
    joueur: &Joueur,
    id: Uuid,
) -> Result<bool, Erreur> {
    Ok(sqlx::query_scalar!(
        r#"select detruire_pli($1, $2) as "detruit!""#,
        id,
        joueur.personnage_id(),
    )
    .fetch_one(&mut **transaction)
    .await?)
}

/// Les plis visés par un geste groupé, sans doublon, en nombre raisonnable.
fn plis_du_geste(mut plis: Vec<Uuid>) -> Result<Vec<Uuid>, Erreur> {
    plis.sort_unstable();
    plis.dedup();
    if plis.is_empty() || plis.len() > PLIS_PAR_GESTE {
        return Err(Erreur::Refus("Choisissez au moins un pli."));
    }
    Ok(plis)
}
