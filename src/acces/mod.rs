//! Les deux portes d'accès aux données.
//!
//! Tout traitement qui répond à quelqu'un passe par l'une des deux :
//!
//! * [`joueur`] : ce qu'un joueur a le droit de voir. Ses requêtes ne lisent le courrier
//!   qu'à travers la vue `plis_recus`, et toujours pour un personnage précis.
//! * [`mj`] : la porte du MJ, qui voit tout. Chacun de ses traitements exige un [`Mj`].
//!
//! Chaque porte exige une preuve d'identité ([`Joueur`] ou [`Mj`]). Ces preuves ne sont
//! fabriquées que par la connexion : un traitement ne peut donc pas répondre à un joueur
//! avec des données du MJ par simple oubli d'une vérification.

pub mod joueur;
pub mod mj;

use uuid::Uuid;

/// Un joueur identifié, et le personnage qu'il incarne.
#[derive(Debug, Clone, Copy)]
pub struct Joueur {
    personnage_id: Uuid,
}

impl Joueur {
    /// Réservé à la connexion, et à la fonction « Voir comme » du MJ.
    pub fn nouveau(personnage_id: Uuid) -> Self {
        Self { personnage_id }
    }

    pub fn personnage_id(&self) -> Uuid {
        self.personnage_id
    }
}

/// Le MJ identifié.
#[derive(Debug, Clone, Copy)]
pub struct Mj {
    compte_id: Uuid,
}

impl Mj {
    /// Réservé à la connexion.
    pub fn nouveau(compte_id: Uuid) -> Self {
        Self { compte_id }
    }

    pub fn compte_id(&self) -> Uuid {
        self.compte_id
    }
}
