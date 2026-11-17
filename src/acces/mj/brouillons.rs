//! Les brouillons et les modèles du MJ.
//!
//! Un brouillon est un document pas encore envoyé, rangé tel que l'écran Documents le
//! montre, même incomplet : il s'enregistre tout seul à chaque changement, et se retrouve
//! sur n'importe quel appareil. Un modèle est un document de départ, nommé par le MJ, sans
//! destinataires ni dates : partir d'un modèle, c'est créer un brouillon qui le recopie.
//!
//! Règles de ce fichier :
//!
//! * un brouillon n'est pas un pli : il ne vit pas dans `plis`, et rien n'en sort vers un
//!   joueur. Il ne devient un pli qu'à l'envoi, par `rediger`, qui vérifie tout ; le
//!   brouillon disparaît dans la même transaction ;
//! * on ne demande à un brouillon ou à un modèle que de ne pas être démesuré
//!   (`Contenu::mesurer`) : ses cases peuvent rester vides ;
//! * la réponse d'un PNJ sous une lettre de la file est un brouillon rattaché à cette
//!   lettre (`reponse_a`). Quand la lettre quitte la file sans que la réponse parte, le
//!   rattachement est défait ([`detacher_reponse`]) : elle reste un brouillon ordinaire.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{Postgres, Transaction};
use ts_rs::TS;
use uuid::Uuid;

use super::documents::{DESTINATAIRES_MAX, DestinataireDocument, DocumentSaisi, rediger};
use super::plume::BilletPnj;
use super::texte_requis;
use crate::acces::Mj;
use crate::base;
use crate::erreur::{Erreur, refus_de_la_base};
use crate::gabarits::Contenu;
use crate::modele::Gabarit;

/// Le nombre de brouillons du MJ, et celui de ses modèles.
const BROUILLONS_MAX: i64 = 200;
const MODELES_MAX: i64 = 200;

/// La longueur de l'aperçu d'un brouillon ou d'un modèle, dans une liste.
const APERCU: usize = 120;

const REFUS_REFERENCE: &str =
    "Ce brouillon cite un personnage, un sceau ou une écriture qui n'existe plus.";

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

/// Un brouillon du MJ, tel que l'écran Documents le remplit.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct BrouillonMjSaisi {
    /// Le PNJ au nom de qui le MJ écrit. Vide : pas encore choisi, ou aucun expéditeur.
    pub auteur_id: Option<Uuid>,
    /// Le MJ a choisi « Aucun expéditeur ».
    pub sans_expediteur: bool,
    pub contenu: Contenu,
    pub signe: bool,
    pub sceau_id: Option<Uuid>,
    pub ecriture_id: Option<Uuid>,
    pub destinataires: Vec<DestinataireDocument>,
    /// La date d'arrivée pour tous. Vide : le délai habituel, plus ou moins le hasard.
    pub livraison_commune: Option<DateTime<Utc>>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct BrouillonMj {
    pub id: Uuid,
    /// La lettre de la file à laquelle il répond. Vide : un document ordinaire.
    pub reponse_a: Option<Uuid>,
    /// L'auteur de cette lettre, pour la reconnaître dans une liste.
    pub reponse_a_auteur: Option<String>,
    pub auteur_id: Option<Uuid>,
    pub sans_expediteur: bool,
    pub contenu: Contenu,
    /// Les premiers mots, pour le reconnaître dans une liste.
    pub apercu: String,
    pub signe: bool,
    pub sceau_id: Option<Uuid>,
    pub ecriture_id: Option<Uuid>,
    pub destinataires: Vec<DestinataireDocument>,
    pub livraison_commune: Option<DateTime<Utc>>,
    pub modifie_le: DateTime<Utc>,
}

/// La réponse d'un PNJ en cours, sous une lettre de la file.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ReponseEnCours {
    /// Le PNJ qui répond : celui à qui la lettre est remise.
    pub pnj_id: Uuid,
    pub billet: BilletPnj,
}

/// La réponse gardée sous une lettre de la file.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct ReponseGardee {
    /// Le PNJ qui répond : la lettre lui revient quand on la rouvre.
    pub pnj_id: Option<Uuid>,
    /// Vide : aucune réponse commencée.
    pub billet: Option<BilletPnj>,
}

/// Un modèle, tel que le MJ l'enregistre.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ModeleSaisi {
    /// Enregistrer sous le nom d'un modèle existant le remplace.
    pub nom: String,
    pub auteur_id: Option<Uuid>,
    pub sans_expediteur: bool,
    pub contenu: Contenu,
    pub signe: bool,
    pub sceau_id: Option<Uuid>,
    pub ecriture_id: Option<Uuid>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct ModeleMj {
    pub id: Uuid,
    pub nom: String,
    pub auteur_id: Option<Uuid>,
    pub sans_expediteur: bool,
    pub contenu: Contenu,
    pub apercu: String,
    pub signe: bool,
    pub sceau_id: Option<Uuid>,
    pub ecriture_id: Option<Uuid>,
    pub modifie_le: DateTime<Utc>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct NomDeModele {
    pub nom: String,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct BrouillonCree {
    pub id: Uuid,
}

// ---------------------------------------------------------------------------
// Les brouillons
// ---------------------------------------------------------------------------

/// Tous les brouillons, le dernier modifié en premier.
pub async fn lister(_mj: Mj) -> Result<Json<Vec<BrouillonMj>>, Erreur> {
    let pool = base::pool().await?;
    let lignes = sqlx::query!(
        r#"
        select
            b.id, b.reponse_a, a.nom as "reponse_a_auteur?",
            b.auteur_id, b.sans_expediteur, b.gabarit as "gabarit: Gabarit", b.contenu,
            b.signe, b.sceau_id, b.ecriture_id, b.destinataires, b.livraison_commune,
            b.modifie_le
        from brouillons_mj b
        left join plis p on p.id = b.reponse_a
        left join personnages a on a.id = p.auteur_id
        order by b.modifie_le desc
        "#
    )
    .fetch_all(pool)
    .await?;

    let brouillons = lignes
        .into_iter()
        .map(|ligne| {
            let contenu = Contenu::depuis_la_base(ligne.gabarit, ligne.contenu);
            BrouillonMj {
                id: ligne.id,
                reponse_a: ligne.reponse_a,
                reponse_a_auteur: ligne.reponse_a_auteur,
                auteur_id: ligne.auteur_id,
                sans_expediteur: ligne.sans_expediteur,
                apercu: contenu.apercu(APERCU),
                contenu,
                signe: ligne.signe,
                sceau_id: ligne.sceau_id,
                ecriture_id: ligne.ecriture_id,
                destinataires: destinataires_lus(ligne.destinataires),
                livraison_commune: ligne.livraison_commune,
                modifie_le: ligne.modifie_le,
            }
        })
        .collect();
    Ok(Json(brouillons))
}

pub async fn lire(_mj: Mj, Path(id): Path<Uuid>) -> Result<Json<BrouillonMj>, Erreur> {
    let pool = base::pool().await?;
    let ligne = sqlx::query!(
        r#"
        select
            b.id, b.reponse_a, a.nom as "reponse_a_auteur?",
            b.auteur_id, b.sans_expediteur, b.gabarit as "gabarit: Gabarit", b.contenu,
            b.signe, b.sceau_id, b.ecriture_id, b.destinataires, b.livraison_commune,
            b.modifie_le
        from brouillons_mj b
        left join plis p on p.id = b.reponse_a
        left join personnages a on a.id = p.auteur_id
        where b.id = $1
        "#,
        id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;

    let contenu = Contenu::depuis_la_base(ligne.gabarit, ligne.contenu);
    Ok(Json(BrouillonMj {
        id: ligne.id,
        reponse_a: ligne.reponse_a,
        reponse_a_auteur: ligne.reponse_a_auteur,
        auteur_id: ligne.auteur_id,
        sans_expediteur: ligne.sans_expediteur,
        apercu: contenu.apercu(APERCU),
        contenu,
        signe: ligne.signe,
        sceau_id: ligne.sceau_id,
        ecriture_id: ligne.ecriture_id,
        destinataires: destinataires_lus(ligne.destinataires),
        livraison_commune: ligne.livraison_commune,
        modifie_le: ligne.modifie_le,
    }))
}

/// Un nouveau brouillon : vierge, ou recopié d'un modèle par l'interface.
pub async fn creer(
    _mj: Mj,
    Json(saisie): Json<BrouillonMjSaisi>,
) -> Result<Json<BrouillonCree>, Erreur> {
    let (contenu, destinataires) = brouillon_mesure(saisie.contenu, &saisie.destinataires)?;
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // Le verrou de la table rend le compte sûr, même avec deux onglets ouverts.
    sqlx::query!("lock table brouillons_mj in share row exclusive mode")
        .execute(&mut *transaction)
        .await?;
    let nombre = sqlx::query_scalar!(r#"select count(*) as "nombre!" from brouillons_mj"#)
        .fetch_one(&mut *transaction)
        .await?;
    if nombre >= BROUILLONS_MAX {
        return Err(Erreur::Refus(
            "Vous avez trop de brouillons : envoyez-en ou jetez-en avant d'en commencer un autre.",
        ));
    }

    let id = sqlx::query_scalar!(
        r#"
        insert into brouillons_mj (
            auteur_id, sans_expediteur, gabarit, contenu, signe, sceau_id, ecriture_id,
            destinataires, livraison_commune
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        returning id
        "#,
        saisie.auteur_id,
        saisie.sans_expediteur,
        contenu.gabarit() as Gabarit,
        contenu.cases(),
        saisie.signe,
        saisie.sceau_id,
        saisie.ecriture_id,
        destinataires,
        saisie.livraison_commune,
    )
    .fetch_one(&mut *transaction)
    .await
    .map_err(refus_de_la_base("", REFUS_REFERENCE))?;

    transaction.commit().await?;
    Ok(Json(BrouillonCree { id }))
}

/// L'enregistrement automatique : le brouillon prend tout ce que l'écran montre.
pub async fn modifier(
    _mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<BrouillonMjSaisi>,
) -> Result<StatusCode, Erreur> {
    let (contenu, destinataires) = brouillon_mesure(saisie.contenu, &saisie.destinataires)?;
    let pool = base::pool().await?;
    let change = sqlx::query!(
        r#"
        update brouillons_mj
        set auteur_id = $2, sans_expediteur = $3, gabarit = $4, contenu = $5, signe = $6,
            sceau_id = $7, ecriture_id = $8, destinataires = $9, livraison_commune = $10,
            modifie_le = now()
        where id = $1
        "#,
        id,
        saisie.auteur_id,
        saisie.sans_expediteur,
        contenu.gabarit() as Gabarit,
        contenu.cases(),
        saisie.signe,
        saisie.sceau_id,
        saisie.ecriture_id,
        destinataires,
        saisie.livraison_commune,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base("", REFUS_REFERENCE))?;
    if change.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn jeter(_mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let change = sqlx::query!("delete from brouillons_mj where id = $1", id)
        .execute(pool)
        .await?;
    if change.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Envoie le document et jette le brouillon, dans le même geste : si l'envoi est refusé,
/// le brouillon reste.
pub async fn envoyer(
    mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<DocumentSaisi>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // Le verrou empêche d'envoyer deux fois le même brouillon, depuis deux onglets.
    let existe = sqlx::query_scalar!("select id from brouillons_mj where id = $1 for update", id)
        .fetch_optional(&mut *transaction)
        .await?;
    if existe.is_none() {
        return Err(Erreur::Introuvable);
    }

    rediger(&mut transaction, &mj, saisie).await?;
    sqlx::query!("delete from brouillons_mj where id = $1", id)
        .execute(&mut *transaction)
        .await?;

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// La réponse d'un PNJ, sous une lettre de la file
// ---------------------------------------------------------------------------

/// La réponse en cours sous cette lettre, s'il y en a une.
pub async fn lire_reponse(
    _mj: Mj,
    Path(lettre_id): Path<Uuid>,
) -> Result<Json<ReponseGardee>, Erreur> {
    let pool = base::pool().await?;
    let ligne = sqlx::query!(
        r#"
        select b.auteur_id, b.gabarit as "gabarit: Gabarit", b.contenu, b.signe, b.sceau_id,
               b.ecriture_id, b.livraison_commune
        from brouillons_mj b
        where b.reponse_a = $1
        "#,
        lettre_id,
    )
    .fetch_optional(pool)
    .await?;

    let pnj_id = ligne.as_ref().and_then(|ligne| ligne.auteur_id);
    let billet = ligne.map(|ligne| {
        let texte = match Contenu::depuis_la_base(ligne.gabarit, ligne.contenu) {
            Contenu::Billet(billet) => billet.texte,
            _ => String::new(),
        };
        BilletPnj {
            ecriture_id: ligne.ecriture_id,
            texte,
            signe: ligne.signe,
            sceau_id: ligne.sceau_id,
            livraison_le: ligne.livraison_commune,
        }
    });
    Ok(Json(ReponseGardee { pnj_id, billet }))
}

/// Enregistre la réponse en cours : un billet du PNJ à l'auteur de la lettre.
pub async fn enregistrer_reponse(
    _mj: Mj,
    Path(lettre_id): Path<Uuid>,
    Json(saisie): Json<ReponseEnCours>,
) -> Result<StatusCode, Erreur> {
    let billet = saisie.billet;
    let contenu = Contenu::billet(billet.texte);
    contenu.mesurer()?;
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    // On ne répond qu'à une lettre encore dans la file, et elle a toujours un auteur.
    let auteur_id = sqlx::query_scalar!(
        "select auteur_id from plis where id = $1 and etat = 'a_traiter' for update",
        lettre_id,
    )
    .fetch_optional(&mut *transaction)
    .await?
    .flatten()
    .ok_or(Erreur::Introuvable)?;

    let destinataires = serde_json::to_value(vec![DestinataireDocument {
        personnage_id: auteur_id,
        livraison_le: None,
    }])
    .map_err(Erreur::interne)?;

    sqlx::query!(
        r#"
        insert into brouillons_mj (
            reponse_a, auteur_id, gabarit, contenu, signe, sceau_id, ecriture_id,
            destinataires, livraison_commune
        )
        values ($1, $2, 'billet', $3, $4, $5, $6, $7, $8)
        on conflict (reponse_a) do update
        set auteur_id = excluded.auteur_id, contenu = excluded.contenu,
            signe = excluded.signe, sceau_id = excluded.sceau_id,
            ecriture_id = excluded.ecriture_id, destinataires = excluded.destinataires,
            livraison_commune = excluded.livraison_commune, modifie_le = now()
        "#,
        lettre_id,
        saisie.pnj_id,
        contenu.cases(),
        billet.signe,
        billet.sceau_id,
        billet.ecriture_id,
        destinataires,
        billet.livraison_le,
    )
    .execute(&mut *transaction)
    .await
    .map_err(refus_de_la_base("", REFUS_REFERENCE))?;

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// La réponse redevenue vierge : il n'y a plus rien à garder.
pub async fn oublier_reponse(_mj: Mj, Path(lettre_id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    sqlx::query!("delete from brouillons_mj where reponse_a = $1", lettre_id)
        .execute(pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// La lettre quitte la file. Une réponse partie avec elle n'a plus lieu d'être gardée ;
/// sinon, elle reste un brouillon ordinaire, si elle n'est pas vide.
pub(super) async fn detacher_reponse(
    transaction: &mut Transaction<'_, Postgres>,
    lettre_id: Uuid,
    reponse_partie: bool,
) -> Result<(), Erreur> {
    sqlx::query!(
        r#"
        delete from brouillons_mj
        where reponse_a = $1
          and ($2 or btrim(coalesce(contenu ->> 'texte', '')) = '')
        "#,
        lettre_id,
        reponse_partie,
    )
    .execute(&mut **transaction)
    .await?;
    sqlx::query!(
        "update brouillons_mj set reponse_a = null, modifie_le = now() where reponse_a = $1",
        lettre_id,
    )
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Les modèles
// ---------------------------------------------------------------------------

/// Tous les modèles, par ordre alphabétique.
pub async fn lister_modeles(_mj: Mj) -> Result<Json<Vec<ModeleMj>>, Erreur> {
    let pool = base::pool().await?;
    let lignes = sqlx::query!(
        r#"
        select id, nom, auteur_id, sans_expediteur, gabarit as "gabarit: Gabarit", contenu,
               signe, sceau_id, ecriture_id, modifie_le
        from modeles
        order by lower(nom)
        "#
    )
    .fetch_all(pool)
    .await?;

    let modeles = lignes
        .into_iter()
        .map(|ligne| {
            let contenu = Contenu::depuis_la_base(ligne.gabarit, ligne.contenu);
            ModeleMj {
                id: ligne.id,
                nom: ligne.nom,
                auteur_id: ligne.auteur_id,
                sans_expediteur: ligne.sans_expediteur,
                apercu: contenu.apercu(APERCU),
                contenu,
                signe: ligne.signe,
                sceau_id: ligne.sceau_id,
                ecriture_id: ligne.ecriture_id,
                modifie_le: ligne.modifie_le,
            }
        })
        .collect();
    Ok(Json(modeles))
}

/// Enregistre un modèle. Sous le nom d'un modèle existant, il le remplace.
pub async fn enregistrer_modele(
    _mj: Mj,
    Json(saisie): Json<ModeleSaisi>,
) -> Result<StatusCode, Erreur> {
    let nom = texte_requis(&saisie.nom, "Donnez un nom à ce modèle.")?;
    let contenu = saisie.contenu.nettoye();
    contenu.mesurer()?;
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    sqlx::query!("lock table modeles in share row exclusive mode")
        .execute(&mut *transaction)
        .await?;
    let nombre = sqlx::query_scalar!(
        r#"select count(*) as "nombre!" from modeles where lower(nom) <> lower($1)"#,
        nom,
    )
    .fetch_one(&mut *transaction)
    .await?;
    if nombre >= MODELES_MAX {
        return Err(Erreur::Refus(
            "Vous avez trop de modèles : supprimez-en avant d'en enregistrer un autre.",
        ));
    }

    sqlx::query!(
        r#"
        insert into modeles (
            nom, auteur_id, sans_expediteur, gabarit, contenu, signe, sceau_id, ecriture_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (lower(nom)) do update
        set nom = excluded.nom, auteur_id = excluded.auteur_id,
            sans_expediteur = excluded.sans_expediteur, gabarit = excluded.gabarit,
            contenu = excluded.contenu, signe = excluded.signe, sceau_id = excluded.sceau_id,
            ecriture_id = excluded.ecriture_id, modifie_le = now()
        "#,
        nom,
        saisie.auteur_id,
        saisie.sans_expediteur,
        contenu.gabarit() as Gabarit,
        contenu.cases(),
        saisie.signe,
        saisie.sceau_id,
        saisie.ecriture_id,
    )
    .execute(&mut *transaction)
    .await
    .map_err(refus_de_la_base("", REFUS_REFERENCE))?;

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn renommer_modele(
    _mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<NomDeModele>,
) -> Result<StatusCode, Erreur> {
    let nom = texte_requis(&saisie.nom, "Donnez un nom à ce modèle.")?;
    let pool = base::pool().await?;
    let change = sqlx::query!(
        "update modeles set nom = $2, modifie_le = now() where id = $1",
        id,
        nom,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base("Un autre modèle porte déjà ce nom.", ""))?;
    if change.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn supprimer_modele(_mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let change = sqlx::query!("delete from modeles where id = $1", id)
        .execute(pool)
        .await?;
    if change.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

/// Ce qu'on demande à un brouillon : rien de démesuré. Rend le contenu et les
/// destinataires, prêts à ranger.
fn brouillon_mesure(
    contenu: Contenu,
    destinataires: &[DestinataireDocument],
) -> Result<(Contenu, Value), Erreur> {
    contenu.mesurer()?;
    if destinataires.len() > DESTINATAIRES_MAX {
        return Err(Erreur::Refus("Ce document a trop de destinataires."));
    }
    let destinataires = serde_json::to_value(destinataires).map_err(Erreur::interne)?;
    Ok((contenu, destinataires))
}

/// Les destinataires rangés. Une liste illisible vaut une liste vide : un brouillon abîmé
/// doit rester ouvrable.
fn destinataires_lus(valeur: Value) -> Vec<DestinataireDocument> {
    serde_json::from_value(valeur).unwrap_or_default()
}
