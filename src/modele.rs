//! Le vocabulaire du jeu, tel qu'il est rangé dans la base.
//!
//! Chaque liste de valeurs correspond à une contrainte `check` de `migrations/`.
//! Ajouter une valeur ici demande une migration qui l'ajoute là-bas.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Déclare une liste de valeurs rangée en texte dans la base,
/// écrite de la même façon en Rust, en SQL, en JSON et en TypeScript.
macro_rules! valeurs {
    ($(#[$doc:meta])* $nom:ident { $($(#[$doc_valeur:meta])* $valeur:ident),+ $(,)? }) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type, TS)]
        #[serde(rename_all = "snake_case")]
        #[sqlx(type_name = "text", rename_all = "snake_case")]
        #[ts(export)]
        pub enum $nom {
            $($(#[$doc_valeur])* $valeur),+
        }
    };
}

valeurs! {
    /// Un compte est celui du MJ ou celui d'un joueur.
    Role { Mj, Joueur }
}

valeurs! {
    GenrePersonnage { Joueur, Pnj }
}

valeurs! {
    /// Les six gabarits de la V1. Chacun a ses cases, rangées dans `contenu`.
    Gabarit { Billet, LettreLongue, Gazette, Acte, Rapport, Carte }
}

valeurs! {
    /// À qui l'auteur adresse son pli.
    GenreDestinataire { Personnage, Gazette, Libre }
}

valeurs! {
    /// La vie d'un pli côté auteur et MJ. La suite se joue exemplaire par exemplaire.
    EtatPli {
        Brouillon,
        /// Envoyé, dans la file du MJ.
        ATraiter,
        /// Le MJ a décidé de son sort : ses exemplaires existent.
        Traite,
        /// Lettre adressée à la gazette et non retenue.
        Ecarte,
    }
}

valeurs! {
    /// Pourquoi un exemplaire existe.
    OrigineExemplaire { Destinataire, Redirection, Copie }
}

valeurs! {
    /// Ce qu'il advient d'un exemplaire en chemin.
    /// « Livré » n'en fait pas partie : c'est `EnRoute` avec une date de livraison passée.
    Acheminement { EnRoute, Retenu, Perdu }
}

valeurs! {
    EtatSceau { Intact, Brise, Recolle, Contrefait }
}

valeurs! {
    EtatSignature { Absente, Intacte, Retiree, Contrefaite }
}

valeurs! {
    /// Comment un contact est entré dans un carnet.
    OrigineContact { Mj, Sceau, Signature }
}
