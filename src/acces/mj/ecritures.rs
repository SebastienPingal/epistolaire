//! Les écritures : une police manuscrite par personnage.

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
pub struct EcritureMj {
    pub id: Uuid,
    pub nom: String,
    /// La police, telle que le thème la connaît.
    pub police: String,
    /// Une écriture générique peut servir à plusieurs PNJ secondaires.
    pub generique: bool,
    /// Les personnages qui écrivent de cette main.
    pub utilisee_par: Vec<String>,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct EcritureModifiee {
    pub nom: String,
    pub generique: bool,
}

pub async fn lister(_mj: Mj) -> Result<Json<Vec<EcritureMj>>, Erreur> {
    let pool = base::pool().await?;
    let ecritures = sqlx::query_as!(
        EcritureMj,
        r#"
        select
            e.id,
            e.nom,
            e.police,
            e.generique,
            coalesce(array_agg(p.nom order by lower(p.nom)) filter (where p.id is not null), '{}')
                as "utilisee_par!"
        from ecritures e
        left join personnages p on p.ecriture_id = e.id
        group by e.id
        order by e.cree_le, e.nom
        "#
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(ecritures))
}

pub async fn modifier(
    _mj: Mj,
    Path(id): Path<Uuid>,
    Json(saisie): Json<EcritureModifiee>,
) -> Result<StatusCode, Erreur> {
    let nom = texte_requis(&saisie.nom, "Une écriture doit avoir un nom.")?;
    let pool = base::pool().await?;

    let modifiee = sqlx::query!(
        "update ecritures set nom = $2, generique = $3 where id = $1",
        id,
        nom,
        saisie.generique,
    )
    .execute(pool)
    .await
    .map_err(refus_de_la_base("Une autre écriture porte déjà ce nom.", ""))?;

    if modifiee.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}
