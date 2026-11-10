//! La fiche du personnage, telle que son joueur la voit : sans les notes du MJ.

use axum::Json;
use serde::Serialize;
use ts_rs::TS;

use super::ecritoire::MonSceau;
use crate::acces::Joueur;
use crate::base;
use crate::erreur::Erreur;

#[derive(Serialize, TS)]
#[ts(export)]
pub struct MaFiche {
    pub nom: String,
    /// La police de son écriture, si le MJ lui en a attribué une.
    pub police: Option<String>,
    pub role: String,
    pub domaine: String,
    pub aptitudes: String,
    pub objectifs: String,
    /// Les sceaux qu'il détient aujourd'hui.
    pub sceaux: Vec<MonSceau>,
}

pub async fn lire(joueur: Joueur) -> Result<Json<MaFiche>, Erreur> {
    let pool = base::pool().await?;

    let fiche = sqlx::query!(
        r#"
        select p.nom, e.police as "police?", p.role, p.domaine, p.aptitudes, p.objectifs
        from personnages p
        left join ecritures e on e.id = p.ecriture_id
        where p.id = $1
        "#,
        joueur.personnage_id(),
    )
    .fetch_one(pool)
    .await?;

    let sceaux = super::ecritoire::mes_sceaux(pool, &joueur).await?;

    Ok(Json(MaFiche {
        nom: fiche.nom,
        police: fiche.police,
        role: fiche.role,
        domaine: fiche.domaine,
        aptitudes: fiche.aptitudes,
        objectifs: fiche.objectifs,
        sceaux,
    }))
}
