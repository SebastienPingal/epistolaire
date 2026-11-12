//! Les plis détruits par leurs destinataires.
//!
//! Un joueur peut détruire un pli reçu, seul ou en supprimant un dossier. Le pli disparaît
//! pour lui, mais la base le garde : le MJ le voit ici, en attendant l'écran complet des
//! correspondances (étape 13).

use axum::Json;
use chrono::{DateTime, Utc};
use serde::Serialize;
use ts_rs::TS;
use uuid::Uuid;

use super::acheminement::SceauPose;
use crate::acces::Mj;
use crate::base;
use crate::erreur::Erreur;

/// Un exemplaire détruit, tel que le MJ le voit : la version livrée.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct PliDetruit {
    pub id: Uuid,
    pub pli_id: Uuid,
    /// Le vrai auteur du pli.
    pub auteur_nom: Option<String>,
    /// Celui qui l'a détruit.
    pub destinataire_nom: String,
    pub detruit_le: DateTime<Utc>,
    pub arrive_le: DateTime<Utc>,
    /// Faux : détruit sans avoir été lu.
    pub ouvert: bool,
    /// Le dossier d'où il a été détruit. Vide : la Réception.
    pub dossier: Option<String>,
    pub texte: String,
    pub police: Option<String>,
    pub signature: Option<String>,
    pub sceau: Option<SceauPose>,
}

/// Les plis détruits, le plus récent en premier.
pub async fn lister(_mj: Mj) -> Result<Json<Vec<PliDetruit>>, Erreur> {
    let pool = base::pool().await?;
    let lignes = sqlx::query!(
        r#"
        select
            x.id,
            x.pli_id,
            a.nom as "auteur_nom?",
            d.nom as destinataire_nom,
            x.detruit_le as "detruit_le!",
            x.livraison_le as "arrive_le!",
            x.ouvert_le is not null as "ouvert!",
            (select v.details->>'dossier' from evenements v
             where v.exemplaire_id = x.id and v.genre = 'destruction'
             order by v.cree_le desc limit 1) as "dossier?",
            coalesce(x.contenu->>'texte', '') as "texte!",
            e.police as "police?",
            case when x.signature_etat in ('intacte', 'contrefaite') then x.signature_nom end
                as "signature?",
            s.nom_grave as "sceau_nom?",
            s.initiales as "sceau_initiales?",
            s.image_url as "sceau_image?"
        from exemplaires x
        join plis p on p.id = x.pli_id
        join personnages d on d.id = x.destinataire_id
        left join personnages a on a.id = p.auteur_id
        left join ecritures e on e.id = x.ecriture_id
        left join sceaux s on s.id = x.sceau_id
        where x.detruit_le is not null
        order by x.detruit_le desc
        "#
    )
    .fetch_all(pool)
    .await?;

    Ok(Json(
        lignes
            .into_iter()
            .map(|ligne| PliDetruit {
                id: ligne.id,
                pli_id: ligne.pli_id,
                auteur_nom: ligne.auteur_nom,
                destinataire_nom: ligne.destinataire_nom,
                detruit_le: ligne.detruit_le,
                arrive_le: ligne.arrive_le,
                ouvert: ligne.ouvert,
                dossier: ligne.dossier,
                texte: ligne.texte,
                police: ligne.police,
                signature: ligne.signature,
                sceau: SceauPose::depuis(ligne.sceau_nom, ligne.sceau_initiales, ligne.sceau_image),
            })
            .collect(),
    ))
}
