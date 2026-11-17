//! La réponse d'un PNJ : le billet que le MJ écrit sous une lettre de la file.
//!
//! C'est un document comme les autres ([`super::documents`]), réduit à ce qu'il faut pour
//! répondre sans quitter l'écran : un billet, pour un seul destinataire.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{Postgres, Transaction};
use ts_rs::TS;
use uuid::Uuid;

use super::documents::{self, DestinataireDocument, DocumentSaisi};
use crate::acces::Mj;
use crate::erreur::Erreur;
use crate::gabarits::Contenu;

/// Ce que le MJ écrit sur le billet d'un PNJ.
#[derive(Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BilletPnj {
    /// L'écriture à donner au PNJ s'il n'en a pas encore. Elle devient la sienne.
    pub ecriture_id: Option<Uuid>,
    pub texte: String,
    pub signe: bool,
    /// Un sceau que le PNJ détient. Vide : le pli part sans sceau.
    pub sceau_id: Option<Uuid>,
    /// Vide : le site applique le délai habituel, plus ou moins le hasard.
    pub livraison_le: Option<DateTime<Utc>>,
}

/// Écrit le billet d'un PNJ et le met en route.
pub(super) async fn rediger(
    transaction: &mut Transaction<'_, Postgres>,
    mj: &Mj,
    auteur_id: Uuid,
    destinataire_id: Uuid,
    billet: BilletPnj,
) -> Result<Uuid, Erreur> {
    documents::rediger(
        transaction,
        mj,
        DocumentSaisi {
            auteur_id: Some(auteur_id),
            contenu: Contenu::billet(billet.texte),
            signe: billet.signe,
            sceau_id: billet.sceau_id,
            ecriture_id: billet.ecriture_id,
            destinataires: vec![DestinataireDocument {
                personnage_id: destinataire_id,
                livraison_le: billet.livraison_le,
            }],
        },
    )
    .await
}
