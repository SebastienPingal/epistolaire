//! Les altérations : ce que le MJ change à la version livrée d'un exemplaire.
//!
//! Il peut réécrire le texte, abîmer un passage, trafiquer le sceau, retirer ou contrefaire
//! la signature, désigner le faussaire, et décider de ce que ce destinataire remarque.
//!
//! Règles de ce fichier :
//!
//! * l'original ne change jamais : `plis.contenu` n'est écrit nulle part ici. Seule la
//!   version livrée (`exemplaires`) est modifiée ;
//! * la version livrée d'un exemplaire ne se modifie que par [`appliquer_version`] (et
//!   [`recopier_version`], pour une copie) ;
//! * les passages réécrits ne viennent jamais de l'interface : le serveur les repère
//!   lui-même, en comparant l'original et la version livrée ([`crate::passages`]) ;
//! * chaque altération ajoute une ligne à l'historique du pli, avec l'avant et l'après ;
//! * un exemplaire arrivé ne s'altère plus ;
//! * rien de tout ceci ne sort par la porte des joueurs : la vue `plis_recus` ne montre que
//!   ce qui est remarqué, et voile toujours les passages abîmés.

use axum::Json;
use axum::extract::Path;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgExecutor, Postgres, Transaction};
use ts_rs::TS;
use uuid::Uuid;

use super::acheminement::{REFUS_PERSONNAGE, SceauPose, noter};
use super::en_route::REFUS_ARRIVE;
use super::plume::LONGUEUR_MAX;
use crate::acces::Mj;
use crate::base;
use crate::erreur::{Erreur, refus_de_la_base};
use crate::modele::{Acheminement, EtatSceau, EtatSignature, Gabarit, OrigineExemplaire};
use crate::passages::{self, Passage, reperer_reecritures, verifier_abimes};

/// Le nom qu'on trace sous une lettre reste court.
const LONGUEUR_SIGNATURE: usize = 200;

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

/// La version livrée d'un exemplaire, telle que le MJ la règle.
///
/// Elle sert dans les deux sens : c'est ce que le MJ lit d'un exemplaire, et ce qu'il
/// renvoie pour l'altérer. Les passages réécrits n'en font pas partie : le serveur les
/// repère seul.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VersionLivree {
    pub texte: String,
    /// Les passages abîmés : toujours visibles du destinataire, jamais lisibles.
    pub passages_abimes: Vec<Passage>,
    /// Le sceau qui ferme l'exemplaire. Intact, brisé ou recollé : c'est celui que l'auteur
    /// a posé. Contrefait : c'est le sceau imité, n'importe lequel. Vide : pas de sceau.
    pub sceau_id: Option<Uuid>,
    pub sceau_etat: Option<EtatSceau>,
    pub signature_etat: EtatSignature,
    /// Le nom tracé par une signature contrefaite. Vide : celui du personnage imité.
    /// Pour une signature de l'auteur, le serveur met lui-même son nom.
    pub signature_nom: Option<String>,
    /// Qui une signature contrefaite imite. Il entrera dans le carnet du destinataire.
    pub signature_personnage_id: Option<Uuid>,
    /// Le faussaire, si c'est un personnage : sa main est la sienne.
    pub faussaire_personnage_id: Option<Uuid>,
    /// L'écriture d'une main inconnue : une écriture qu'aucun personnage n'utilise.
    /// Quand le faussaire est un personnage, le serveur met ici la sienne.
    pub faussaire_ecriture_id: Option<Uuid>,
    /// Ce que ce destinataire remarque. Par défaut : rien.
    pub remarque_texte: bool,
    pub remarque_sceau: bool,
    pub remarque_signature: bool,
}

/// Un exemplaire, avec tout ce que seul le MJ voit : l'original, la version livrée,
/// les passages réécrits, et l'historique.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct ExemplaireDetail {
    pub id: Uuid,
    pub pli_id: Uuid,
    /// Le vrai auteur du pli.
    pub auteur_id: Option<Uuid>,
    pub auteur_nom: Option<String>,
    pub destinataire_id: Uuid,
    pub destinataire_nom: String,
    pub origine: OrigineExemplaire,
    pub acheminement: Acheminement,
    pub livraison_le: Option<DateTime<Utc>>,
    pub envoye_le: DateTime<Utc>,
    /// Arrivé : il ne se modifie plus.
    pub arrive: bool,
    pub original: Original,
    pub version: VersionLivree,
    /// Les passages réécrits que le serveur a repérés dans la version livrée.
    pub passages_reecrits: Vec<Passage>,
    /// Ce qui est arrivé à ce pli et à cet exemplaire, du plus ancien au plus récent.
    pub historique: Vec<Evenement>,
}

/// Ce que l'auteur a écrit. Rien ne le modifie jamais.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Original {
    pub texte: String,
    /// La police de l'écriture de l'auteur.
    pub police: Option<String>,
    pub signe: bool,
    pub sceau_id: Option<Uuid>,
    pub sceau: Option<SceauPose>,
}

/// Une ligne de l'historique d'un pli.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Evenement {
    /// Le geste : `traitement`, `modification`, `alteration`, `copie`, `envoi`…
    pub genre: String,
    /// Le détail du geste. Pour une altération : `avant` et `apres`, deux versions livrées.
    #[ts(type = "unknown")]
    pub details: Value,
    pub cree_le: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Les traitements
// ---------------------------------------------------------------------------

/// Tout un exemplaire, arrivé ou non : l'original, la version livrée, l'historique.
pub async fn lire(_mj: Mj, Path(id): Path<Uuid>) -> Result<Json<ExemplaireDetail>, Erreur> {
    detail(id).await.map(Json)
}

/// Enregistre la nouvelle version livrée d'un exemplaire qui n'est pas encore arrivé.
pub async fn alterer(
    mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<VersionLivree>,
) -> Result<Json<ExemplaireDetail>, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // Le verrou tient l'exemplaire jusqu'à la fin : il ne change pas de sort entre-temps.
    let arrive = sqlx::query_scalar!(
        r#"
        select (acheminement = 'en_route' and livraison_le <= now()) as "arrive!"
        from exemplaires
        where id = $1
        for update
        "#,
        id,
    )
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;
    if arrive {
        return Err(REFUS_ARRIVE);
    }

    appliquer_version(&mut transaction, &mj, id, &saisie, true).await?;
    transaction.commit().await?;

    detail(id).await.map(Json)
}

/// Donne à un exemplaire sa version livrée, et le note dans l'historique du pli.
///
/// `detection` : faux au traitement d'une lettre, où la même version part vers tous les
/// destinataires sans que rien ne soit remarqué. Le MJ décide ensuite, pour chacun, dans
/// l'écran En route.
///
/// Cette fonction ne vérifie pas que l'exemplaire est encore en chemin : c'est à
/// l'appelant de le faire, sous verrou.
pub(super) async fn appliquer_version(
    transaction: &mut Transaction<'_, Postgres>,
    mj: &Mj,
    id: Uuid,
    saisie: &VersionLivree,
    detection: bool,
) -> Result<(), Erreur> {
    let contexte = sqlx::query!(
        r#"
        select
            x.pli_id,
            x.ecriture_id,
            p.gabarit as "gabarit: Gabarit",
            coalesce(p.contenu->>'texte', '') as "original!",
            p.sceau_id as sceau_origine,
            p.signe,
            a.id as "auteur_id?",
            a.nom as "auteur_nom?"
        from exemplaires x
        join plis p on p.id = x.pli_id
        left join personnages a on a.id = p.auteur_id
        where x.id = $1
        for update of x
        "#,
        id,
    )
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;
    let avant = version_de(&mut **transaction, id)
        .await?
        .ok_or(Erreur::Introuvable)?;

    if contexte.gabarit != Gabarit::Billet {
        return Err(Erreur::Refus("Seul un billet s'altère pour l'instant."));
    }

    // Le texte n'est pas retouché ici : les passages abîmés comptent ses caractères.
    if saisie.texte.trim().is_empty() {
        return Err(Erreur::Refus(
            "Le texte livré est vide. Pour qu'une lettre n'arrive pas, perdez-la plutôt.",
        ));
    }
    if saisie.texte.chars().count() > LONGUEUR_MAX {
        return Err(Erreur::Refus("Ce texte est bien trop long pour un billet."));
    }
    let passages_abimes = verifier_abimes(&saisie.texte, &saisie.passages_abimes)?;
    let passages_reecrits = reperer_reecritures(&contexte.original, &saisie.texte);

    // Le sceau. Celui que l'auteur a posé peut être intact, brisé ou recollé. Tout autre
    // sceau est une imitation, y compris sur un pli qui n'était pas scellé.
    let (sceau_id, sceau_etat) = match (saisie.sceau_id, saisie.sceau_etat) {
        (None, None) if contexte.sceau_origine.is_none() => (None, None),
        (None, None) => {
            return Err(Erreur::Refus(
                "Ce pli est scellé : son sceau peut être brisé, recollé ou contrefait, pas retiré.",
            ));
        }
        (Some(sceau), Some(EtatSceau::Contrefait)) => (Some(sceau), Some(EtatSceau::Contrefait)),
        (Some(sceau), Some(etat)) if Some(sceau) == contexte.sceau_origine => {
            (Some(sceau), Some(etat))
        }
        (Some(_), Some(_)) => {
            return Err(Erreur::Refus(
                "Seul le sceau posé par l'auteur peut être intact, brisé ou recollé. Un autre sceau est une contrefaçon.",
            ));
        }
        _ => return Err(Erreur::Refus("Un sceau a un état, et un état a un sceau.")),
    };

    // La signature. Celle de l'auteur reste telle que l'exemplaire l'a recopiée ; une
    // signature contrefaite imite quelqu'un, et paraît de sa main tant qu'on ne remarque rien.
    let (signature_etat, signature_nom, signature_ecriture_id, signature_personnage_id) =
        match saisie.signature_etat {
            EtatSignature::Absente if contexte.signe => {
                return Err(Erreur::Refus(
                    "Cette lettre est signée : sa signature peut être retirée ou contrefaite.",
                ));
            }
            EtatSignature::Absente => (EtatSignature::Absente, None, None, None),
            EtatSignature::Intacte | EtatSignature::Retiree if !contexte.signe => {
                return Err(Erreur::Refus(
                    "Cette lettre n'est pas signée : il n'y a pas de signature à garder ni à retirer.",
                ));
            }
            // Le nom reste celui que l'exemplaire a recopié à sa création, même si
            // l'auteur a changé de nom depuis.
            etat @ (EtatSignature::Intacte | EtatSignature::Retiree) => (
                etat,
                match avant.signature_etat {
                    EtatSignature::Intacte | EtatSignature::Retiree => avant.signature_nom.clone(),
                    _ => contexte.auteur_nom.clone(),
                },
                contexte.ecriture_id,
                contexte.auteur_id,
            ),
            EtatSignature::Contrefaite => {
                let imite = match saisie.signature_personnage_id {
                    Some(personnage_id) => Some(personnage(transaction, personnage_id).await?),
                    None => None,
                };
                let nom = saisie
                    .signature_nom
                    .as_deref()
                    .map(str::trim)
                    .filter(|nom| !nom.is_empty())
                    .map(str::to_owned)
                    .or_else(|| imite.as_ref().map(|imite| imite.nom.clone()))
                    .ok_or(Erreur::Refus("Une signature contrefaite porte un nom."))?;
                if nom.chars().count() > LONGUEUR_SIGNATURE {
                    return Err(Erreur::Refus("Ce nom est trop long pour une signature."));
                }
                (
                    EtatSignature::Contrefaite,
                    Some(nom),
                    imite
                        .and_then(|imite| imite.ecriture_id)
                        .or(contexte.ecriture_id),
                    saisie.signature_personnage_id,
                )
            }
        };

    // Le faussaire : un personnage, avec sa propre main, ou une main inconnue.
    let (faussaire_personnage_id, faussaire_ecriture_id) =
        match (saisie.faussaire_personnage_id, saisie.faussaire_ecriture_id) {
            (Some(personnage_id), _) => {
                let ecriture_id = personnage(transaction, personnage_id)
                    .await?
                    .ecriture_id
                    .ok_or(Erreur::Refus(
                        "Ce personnage n'a pas encore d'écriture : donnez-lui en une avant d'en faire un faussaire.",
                    ))?;
                (Some(personnage_id), Some(ecriture_id))
            }
            (None, Some(ecriture_id)) => {
                let prise = sqlx::query_scalar!(
                    r#"
                    select exists (
                        select 1 from personnages where ecriture_id = e.id
                    ) as "prise!"
                    from ecritures e
                    where e.id = $1
                    "#,
                    ecriture_id,
                )
                .fetch_optional(&mut **transaction)
                .await?
                .ok_or(Erreur::Refus("Cette écriture n'existe pas."))?;
                if prise {
                    return Err(Erreur::Refus(
                        "Cette écriture est celle d'un personnage : pour une main inconnue, prenez-en une que personne n'utilise.",
                    ));
                }
                (None, Some(ecriture_id))
            }
            (None, None) => (None, None),
        };

    // Ce que le destinataire remarque. Un interrupteur ne compte que s'il y a quelque
    // chose à remarquer : il ne doit pas rester allumé pour une altération à venir.
    let remarque_texte = detection && saisie.remarque_texte && !passages_reecrits.is_empty();
    let remarque_sceau =
        detection && saisie.remarque_sceau && sceau_etat.is_some_and(|etat| etat != EtatSceau::Intact);
    let remarque_signature = detection
        && saisie.remarque_signature
        && signature_etat == EtatSignature::Contrefaite;
    if (remarque_texte || remarque_signature) && faussaire_ecriture_id.is_none() {
        return Err(Erreur::Refus(
            "Désignez le faussaire : ce que le destinataire remarque paraîtra dans son écriture.",
        ));
    }

    let apres = VersionLivree {
        texte: saisie.texte.clone(),
        passages_abimes,
        sceau_id,
        sceau_etat,
        signature_etat,
        // Une signature retirée garde son nom en réserve : il ne sort pas, mais la
        // signature peut ainsi être rétablie telle quelle.
        signature_nom,
        signature_personnage_id,
        faussaire_personnage_id,
        faussaire_ecriture_id,
        remarque_texte,
        remarque_sceau,
        remarque_signature,
    };
    if apres == avant {
        return Ok(());
    }

    sqlx::query!(
        r#"
        update exemplaires
        set contenu = jsonb_set(contenu, '{texte}', to_jsonb($2::text)),
            passages_abimes = $3,
            passages_reecrits = $4,
            sceau_id = $5,
            sceau_etat = $6,
            signature_etat = $7,
            signature_nom = $8,
            signature_ecriture_id = $9,
            signature_personnage_id = $10,
            faussaire_personnage_id = $11,
            faussaire_ecriture_id = $12,
            remarque_texte = $13,
            remarque_sceau = $14,
            remarque_signature = $15,
            modifie_le = now()
        where id = $1
        "#,
        id,
        apres.texte,
        json!(apres.passages_abimes),
        json!(passages_reecrits),
        apres.sceau_id,
        apres.sceau_etat as Option<EtatSceau>,
        apres.signature_etat as EtatSignature,
        apres.signature_nom,
        signature_ecriture_id,
        apres.signature_personnage_id,
        apres.faussaire_personnage_id,
        apres.faussaire_ecriture_id,
        apres.remarque_texte,
        apres.remarque_sceau,
        apres.remarque_signature,
    )
    .execute(&mut **transaction)
    .await
    .map_err(refus_de_la_base("", "Ce sceau n'existe pas."))?;

    noter(
        transaction,
        mj,
        contexte.pli_id,
        Some(id),
        "alteration",
        json!({ "avant": avant, "apres": apres }),
    )
    .await
}

/// Donne à une copie la version livrée de l'exemplaire copié : le tiers reçoit ce que
/// reçoit le destinataire. Rien n'est remarqué par le tiers : le MJ en décide ensuite.
pub(super) async fn recopier_version(
    transaction: &mut Transaction<'_, Postgres>,
    source_id: Uuid,
    copie_id: Uuid,
) -> Result<(), Erreur> {
    sqlx::query!(
        r#"
        update exemplaires copie
        set contenu = source.contenu,
            passages_abimes = source.passages_abimes,
            passages_reecrits = source.passages_reecrits,
            sceau_id = source.sceau_id,
            sceau_etat = source.sceau_etat,
            signature_etat = source.signature_etat,
            signature_nom = source.signature_nom,
            signature_ecriture_id = source.signature_ecriture_id,
            signature_personnage_id = source.signature_personnage_id,
            faussaire_personnage_id = source.faussaire_personnage_id,
            faussaire_ecriture_id = source.faussaire_ecriture_id
        from exemplaires source
        where copie.id = $2 and source.id = $1 and source.pli_id = copie.pli_id
        "#,
        source_id,
        copie_id,
    )
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Les lectures
// ---------------------------------------------------------------------------

struct PersonnageImite {
    nom: String,
    ecriture_id: Option<Uuid>,
}

async fn personnage(
    transaction: &mut Transaction<'_, Postgres>,
    id: Uuid,
) -> Result<PersonnageImite, Erreur> {
    sqlx::query_as!(
        PersonnageImite,
        "select nom, ecriture_id from personnages where id = $1",
        id,
    )
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or(REFUS_PERSONNAGE)
}

/// La version livrée d'un exemplaire, telle qu'elle est dans la base.
async fn version_de<'e>(
    executeur: impl PgExecutor<'e>,
    id: Uuid,
) -> Result<Option<VersionLivree>, Erreur> {
    let ligne = sqlx::query!(
        r#"
        select
            coalesce(contenu->>'texte', '') as "texte!",
            passages_abimes,
            sceau_id,
            sceau_etat as "sceau_etat: EtatSceau",
            signature_etat as "signature_etat: EtatSignature",
            signature_nom,
            signature_personnage_id,
            faussaire_personnage_id,
            faussaire_ecriture_id,
            remarque_texte,
            remarque_sceau,
            remarque_signature
        from exemplaires
        where id = $1
        "#,
        id,
    )
    .fetch_optional(executeur)
    .await?;

    Ok(ligne.map(|ligne| VersionLivree {
        texte: ligne.texte,
        passages_abimes: passages::depuis_la_base(ligne.passages_abimes),
        sceau_id: ligne.sceau_id,
        sceau_etat: ligne.sceau_etat,
        signature_etat: ligne.signature_etat,
        signature_nom: ligne.signature_nom,
        signature_personnage_id: ligne.signature_personnage_id,
        faussaire_personnage_id: ligne.faussaire_personnage_id,
        faussaire_ecriture_id: ligne.faussaire_ecriture_id,
        remarque_texte: ligne.remarque_texte,
        remarque_sceau: ligne.remarque_sceau,
        remarque_signature: ligne.remarque_signature,
    }))
}

async fn detail(id: Uuid) -> Result<ExemplaireDetail, Erreur> {
    let pool = base::pool().await?;
    let ligne = sqlx::query!(
        r#"
        select
            x.pli_id,
            p.auteur_id,
            a.nom as "auteur_nom?",
            x.destinataire_id,
            d.nom as destinataire_nom,
            x.origine as "origine: OrigineExemplaire",
            x.acheminement as "acheminement: Acheminement",
            x.livraison_le,
            p.envoye_le as "envoye_le!",
            (x.acheminement = 'en_route' and x.livraison_le <= now()) as "arrive!",
            coalesce(p.contenu->>'texte', '') as "original!",
            p.signe,
            p.sceau_id as sceau_origine_id,
            s.nom_grave as "sceau_nom?",
            s.initiales as "sceau_initiales?",
            s.image_url as "sceau_image?",
            e.police as "police?",
            x.passages_reecrits
        from exemplaires x
        join plis p on p.id = x.pli_id
        join personnages d on d.id = x.destinataire_id
        left join personnages a on a.id = p.auteur_id
        left join ecritures e on e.id = x.ecriture_id
        left join sceaux s on s.id = p.sceau_id
        where x.id = $1
        "#,
        id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;
    let version = version_de(pool, id).await?.ok_or(Erreur::Introuvable)?;

    // L'historique du pli : ce qui le concerne tout entier, et ce qui concerne cet exemplaire.
    let historique = sqlx::query_as!(
        Evenement,
        r#"
        select genre, details, cree_le
        from evenements
        where pli_id = $1 and (exemplaire_id is null or exemplaire_id = $2)
        order by cree_le, id
        "#,
        ligne.pli_id,
        id,
    )
    .fetch_all(pool)
    .await?;

    Ok(ExemplaireDetail {
        id,
        pli_id: ligne.pli_id,
        auteur_id: ligne.auteur_id,
        auteur_nom: ligne.auteur_nom,
        destinataire_id: ligne.destinataire_id,
        destinataire_nom: ligne.destinataire_nom,
        origine: ligne.origine,
        acheminement: ligne.acheminement,
        livraison_le: ligne.livraison_le,
        envoye_le: ligne.envoye_le,
        arrive: ligne.arrive,
        original: Original {
            texte: ligne.original,
            police: ligne.police,
            signe: ligne.signe,
            sceau_id: ligne.sceau_origine_id,
            sceau: SceauPose::depuis(ligne.sceau_nom, ligne.sceau_initiales, ligne.sceau_image),
        },
        version,
        passages_reecrits: passages::depuis_la_base(ligne.passages_reecrits),
        historique,
    })
}
