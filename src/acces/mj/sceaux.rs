//! Les sceaux : des objets que le MJ crée, attribue, retire ou transfère.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::texte_requis;
use crate::acces::Mj;
use crate::base;
use crate::erreur::{Erreur, refus_de_la_base};

#[derive(Serialize, TS)]
#[ts(export)]
pub struct SceauMj {
    pub id: Uuid,
    /// Le nom gravé : il ne change pas quand le sceau change de mains.
    pub nom_grave: String,
    pub initiales: String,
    pub image_url: Option<String>,
    pub proprietaire_origine_id: Option<Uuid>,
    pub proprietaire_origine_nom: Option<String>,
    /// Qui le détient aujourd'hui. Vide : personne, le MJ le garde.
    pub detenteur_id: Option<Uuid>,
    pub detenteur_nom: Option<String>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct SceauSaisi {
    pub nom_grave: String,
    pub initiales: String,
    pub detenteur_id: Option<Uuid>,
}

pub async fn lister(_mj: Mj) -> Result<Json<Vec<SceauMj>>, Erreur> {
    let pool = base::pool().await?;
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
        order by lower(s.nom_grave), s.cree_le
        "#
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(sceaux))
}

/// Crée un sceau. Son premier détenteur en est le propriétaire d'origine.
pub async fn creer(_mj: Mj, Json(saisie): Json<SceauSaisi>) -> Result<StatusCode, Erreur> {
    let nom_grave = texte_requis(&saisie.nom_grave, "Un sceau doit porter un nom gravé.")?;
    let initiales = initiales_valides(&saisie.initiales)?;
    let pool = base::pool().await?;

    sqlx::query!(
        r#"
        insert into sceaux (nom_grave, initiales, proprietaire_origine_id, detenteur_id)
        values ($1, $2, $3, $3)
        "#,
        nom_grave,
        initiales,
        saisie.detenteur_id,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base("", "Ce personnage n'existe pas."))?;

    Ok(StatusCode::NO_CONTENT)
}

/// Modifie un sceau, ou le fait changer de mains.
pub async fn modifier(
    _mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<SceauSaisi>,
) -> Result<StatusCode, Erreur> {
    let nom_grave = texte_requis(&saisie.nom_grave, "Un sceau doit porter un nom gravé.")?;
    let initiales = initiales_valides(&saisie.initiales)?;
    let pool = base::pool().await?;

    let modifie = sqlx::query!(
        "update sceaux set nom_grave = $2, initiales = $3, detenteur_id = $4 where id = $1",
        id,
        nom_grave,
        initiales,
        saisie.detenteur_id,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base("", "Ce personnage n'existe pas."))?;

    if modifie.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn supprimer(_mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    sqlx::query!("delete from sceaux where id = $1", id)
        .execute(pool)
        .await
        .map_err(refus_de_la_base(
            "",
            "Ce sceau a déjà fermé un pli : il ne peut plus être supprimé. Vous pouvez le retirer à son détenteur.",
        ))?;
    Ok(StatusCode::NO_CONTENT)
}

fn initiales_valides(initiales: &str) -> Result<String, Erreur> {
    let initiales = initiales.trim();
    if initiales.chars().count() > 3 {
        return Err(Erreur::Refus("Un sceau porte au plus trois initiales."));
    }
    Ok(initiales.to_owned())
}

/// Les initiales proposées pour un nom : la première lettre des deux premiers mots.
pub fn initiales_de(nom: &str) -> String {
    nom.split_whitespace()
        .filter_map(|mot| mot.chars().find(|c| c.is_alphabetic()))
        .filter(|lettre| lettre.is_uppercase())
        .take(2)
        .collect()
}
