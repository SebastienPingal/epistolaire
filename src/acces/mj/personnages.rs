//! Les personnages : ceux des joueurs et les PNJ, leur fiche, leur compte et leur carnet.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use super::sceaux::{SceauMj, initiales_de};
use super::texte_requis;
use crate::acces::Mj;
use crate::base;
use crate::connexion::normaliser_email;
use crate::erreur::{Erreur, refus_de_la_base};
use crate::modele::{GenrePersonnage, OrigineContact};

const REFUS_NOM: &str = "Un personnage doit avoir un nom.";
const REFUS_ADRESSE: &str = "Cette adresse n'a pas la forme d'une adresse e-mail.";
const REFUS_ADRESSE_PRISE: &str = "Cette adresse est déjà celle d'un autre compte.";
const REFUS_ECRITURE_PRISE: &str = "Cette écriture est déjà celle d'un autre joueur.";

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

#[derive(Serialize, TS)]
#[ts(export)]
pub struct PersonnageResume {
    pub id: Uuid,
    pub nom: String,
    pub genre: GenrePersonnage,
    pub role: String,
    /// L'adresse du joueur. Vide pour un PNJ, ou un joueur pas encore invité.
    pub email: Option<String>,
    pub ecriture_id: Option<Uuid>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct PersonnageDetail {
    pub id: Uuid,
    pub nom: String,
    pub genre: GenrePersonnage,
    pub email: Option<String>,
    pub ecriture_id: Option<Uuid>,
    pub role: String,
    pub domaine: String,
    pub aptitudes: String,
    pub objectifs: String,
    pub notes_mj: String,
    /// Quota propre à ce personnage. Vide : le réglage général s'applique.
    pub quota_hebdo: Option<i32>,
    /// Les sceaux qu'il détient aujourd'hui.
    pub sceaux: Vec<SceauMj>,
    /// Son carnet d'adresses. Toujours vide pour un PNJ.
    pub carnet: Vec<ContactMj>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct ContactMj {
    pub personnage_id: Uuid,
    pub nom: String,
    /// La qualité du contact telle que ce joueur la connaît.
    pub qualite: Option<String>,
    pub origine: OrigineContact,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct NouveauPersonnage {
    pub nom: String,
    pub genre: GenrePersonnage,
    pub email: Option<String>,
    /// Crée dans la foulée un sceau à son nom, qu'il détient.
    pub creer_sceau: bool,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct PersonnageModifie {
    pub nom: String,
    pub email: Option<String>,
    pub ecriture_id: Option<Uuid>,
    pub role: String,
    pub domaine: String,
    pub aptitudes: String,
    pub objectifs: String,
    pub notes_mj: String,
    pub quota_hebdo: Option<i32>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ContactNote {
    pub qualite: Option<String>,
}

// ---------------------------------------------------------------------------
// Les traitements
// ---------------------------------------------------------------------------

pub async fn lister(_mj: Mj) -> Result<Json<Vec<PersonnageResume>>, Erreur> {
    let pool = base::pool().await?;
    let personnages = sqlx::query_as!(
        PersonnageResume,
        r#"
        select
            p.id, p.nom, p.genre as "genre: GenrePersonnage", p.role,
            c.email::text as "email?", p.ecriture_id
        from personnages p
        left join comptes c on c.id = p.compte_id
        order by p.genre, lower(p.nom)
        "#
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(personnages))
}

pub async fn creer(
    _mj: Mj,
    Json(saisie): Json<NouveauPersonnage>,
) -> Result<Json<PersonnageDetail>, Erreur> {
    let nom = texte_requis(&saisie.nom, REFUS_NOM)?;
    let email = adresse_saisie(saisie.email.as_deref())?;
    if email.is_some() && saisie.genre == GenrePersonnage::Pnj {
        return Err(Erreur::Refus("Un PNJ n'a pas d'adresse e-mail : c'est vous qui écrivez en son nom."));
    }

    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    let compte_id = match &email {
        Some(email) => Some(creer_compte(&mut transaction, email).await?),
        None => None,
    };

    let id = sqlx::query_scalar!(
        "insert into personnages (nom, genre, compte_id) values ($1, $2, $3) returning id",
        nom,
        saisie.genre as GenrePersonnage,
        compte_id,
    )
    .fetch_one(&mut *transaction)
    .await?;

    if saisie.creer_sceau {
        sqlx::query!(
            r#"
            insert into sceaux (nom_grave, initiales, proprietaire_origine_id, detenteur_id)
            values ($1, $2, $3, $3)
            "#,
            nom,
            initiales_de(&nom),
            id,
        )
        .execute(&mut *transaction)
        .await?;
    }

    transaction.commit().await?;
    Ok(Json(detail(pool, id).await?))
}

pub async fn lire(_mj: Mj, Path(id): Path<Uuid>) -> Result<Json<PersonnageDetail>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(detail(pool, id).await?))
}

pub async fn modifier(
    _mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<PersonnageModifie>,
) -> Result<Json<PersonnageDetail>, Erreur> {
    let nom = texte_requis(&saisie.nom, REFUS_NOM)?;
    let email = adresse_saisie(saisie.email.as_deref())?;
    if saisie.quota_hebdo.is_some_and(|quota| quota < 0) {
        return Err(Erreur::Refus("Un quota ne peut pas être négatif."));
    }

    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    let actuel = sqlx::query!(
        r#"
        select genre as "genre: GenrePersonnage", compte_id
        from personnages where id = $1 for update
        "#,
        id,
    )
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or(Erreur::Introuvable)?;

    // L'adresse du joueur : créée, changée ou retirée selon ce qui est saisi.
    let compte_id = match (&email, actuel.compte_id) {
        (Some(_), _) if actuel.genre == GenrePersonnage::Pnj => {
            return Err(Erreur::Refus("Un PNJ n'a pas d'adresse e-mail : c'est vous qui écrivez en son nom."));
        }
        (Some(email), Some(compte_id)) => {
            sqlx::query!(
                "update comptes set email = $2::text::citext where id = $1",
                compte_id,
                email,
            )
            .execute(&mut *transaction)
            .await
            .map_err(refus_de_la_base(REFUS_ADRESSE_PRISE, ""))?;
            Some(compte_id)
        }
        (Some(email), None) => Some(creer_compte(&mut transaction, email).await?),
        (None, _) => None,
    };

    sqlx::query!(
        r#"
        update personnages
        set nom = $2, compte_id = $3, ecriture_id = $4, role = $5, domaine = $6,
            aptitudes = $7, objectifs = $8, notes_mj = $9, quota_hebdo = $10
        where id = $1
        "#,
        id,
        nom,
        compte_id,
        saisie.ecriture_id,
        saisie.role.trim(),
        saisie.domaine.trim(),
        saisie.aptitudes.trim(),
        saisie.objectifs.trim(),
        saisie.notes_mj.trim(),
        saisie.quota_hebdo,
    )
    .execute(&mut *transaction)
    .await
    .map_err(refus_de_la_base(REFUS_ECRITURE_PRISE, "Cette écriture n'existe pas."))?;

    // Adresse retirée : le compte disparaît, et ses sessions avec lui.
    if let (None, Some(ancien)) = (&email, actuel.compte_id) {
        sqlx::query!("delete from comptes where id = $1", ancien)
            .execute(&mut *transaction)
            .await?;
    }

    transaction.commit().await?;
    Ok(Json(detail(pool, id).await?))
}

pub async fn supprimer(_mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let mut transaction = pool.begin().await?;

    let compte_id = sqlx::query_scalar!("select compte_id from personnages where id = $1", id)
        .fetch_optional(&mut *transaction)
        .await?
        .ok_or(Erreur::Introuvable)?;

    sqlx::query!("delete from personnages where id = $1", id)
        .execute(&mut *transaction)
        .await
        .map_err(refus_de_la_base(
            "",
            "Ce personnage a déjà écrit ou reçu du courrier : il ne peut plus être supprimé.",
        ))?;

    if let Some(compte_id) = compte_id {
        sqlx::query!("delete from comptes where id = $1", compte_id)
            .execute(&mut *transaction)
            .await?;
    }

    transaction.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Ajoute un contact au carnet d'un joueur, ou change sa qualité.
pub async fn noter_contact(
    _mj: Mj,
    Path((id, contact_id)): Path<(Uuid, Uuid)>,
    Json(saisie): Json<ContactNote>,
) -> Result<StatusCode, Erreur> {
    if id == contact_id {
        return Err(Erreur::Refus("Un personnage ne figure pas dans son propre carnet."));
    }
    let qualite = saisie
        .qualite
        .as_deref()
        .map(str::trim)
        .filter(|qualite| !qualite.is_empty());

    let pool = base::pool().await?;
    let genre = sqlx::query_scalar!(
        r#"select genre as "genre: GenrePersonnage" from personnages where id = $1"#,
        id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;
    if genre != GenrePersonnage::Joueur {
        return Err(Erreur::Refus("Seuls les joueurs ont un carnet."));
    }

    sqlx::query!(
        r#"
        insert into contacts (proprietaire_id, personnage_id, qualite, origine)
        values ($1, $2, $3, 'mj')
        on conflict (proprietaire_id, personnage_id) do update set qualite = excluded.qualite
        "#,
        id,
        contact_id,
        qualite,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base("", "Ce personnage n'existe pas."))?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn retirer_contact(
    _mj: Mj,
    Path((id, contact_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    sqlx::query!(
        "delete from contacts where proprietaire_id = $1 and personnage_id = $2",
        id,
        contact_id,
    )
    .execute(pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

// ---------------------------------------------------------------------------
// Rouages
// ---------------------------------------------------------------------------

async fn detail(pool: &PgPool, id: Uuid) -> Result<PersonnageDetail, Erreur> {
    let personnage = sqlx::query!(
        r#"
        select
            p.id, p.nom, p.genre as "genre: GenrePersonnage", c.email::text as "email?",
            p.ecriture_id, p.role, p.domaine, p.aptitudes, p.objectifs, p.notes_mj, p.quota_hebdo
        from personnages p
        left join comptes c on c.id = p.compte_id
        where p.id = $1
        "#,
        id,
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;

    let sceaux = sqlx::query_as!(
        SceauMj,
        r#"
        select
            s.id, s.nom_grave, s.initiales, s.image_url,
            s.proprietaire_origine_id, o.nom as "proprietaire_origine_nom?",
            s.detenteur_id, d.nom as "detenteur_nom?"
        from sceaux s
        left join personnages o on o.id = s.proprietaire_origine_id
        left join personnages d on d.id = s.detenteur_id
        where s.detenteur_id = $1
        order by s.cree_le
        "#,
        id,
    )
    .fetch_all(pool)
    .await?;

    let carnet = sqlx::query_as!(
        ContactMj,
        r#"
        select
            k.personnage_id, p.nom, k.qualite, k.origine as "origine: OrigineContact"
        from contacts k
        join personnages p on p.id = k.personnage_id
        where k.proprietaire_id = $1
        order by lower(p.nom)
        "#,
        id,
    )
    .fetch_all(pool)
    .await?;

    Ok(PersonnageDetail {
        id: personnage.id,
        nom: personnage.nom,
        genre: personnage.genre,
        email: personnage.email,
        ecriture_id: personnage.ecriture_id,
        role: personnage.role,
        domaine: personnage.domaine,
        aptitudes: personnage.aptitudes,
        objectifs: personnage.objectifs,
        notes_mj: personnage.notes_mj,
        quota_hebdo: personnage.quota_hebdo,
        sceaux,
        carnet,
    })
}

/// L'adresse saisie, mise en forme. Un champ vide vaut « pas d'adresse ».
fn adresse_saisie(saisie: Option<&str>) -> Result<Option<String>, Erreur> {
    match saisie.map(str::trim).filter(|adresse| !adresse.is_empty()) {
        None => Ok(None),
        Some(adresse) => normaliser_email(adresse)
            .map(Some)
            .ok_or(Erreur::Refus(REFUS_ADRESSE)),
    }
}

async fn creer_compte(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    email: &str,
) -> Result<Uuid, Erreur> {
    sqlx::query_scalar!(
        "insert into comptes (email, role) values ($1::text::citext, 'joueur') returning id",
        email,
    )
    .fetch_one(&mut **transaction)
    .await
    .map_err(refus_de_la_base(REFUS_ADRESSE_PRISE, ""))
}
