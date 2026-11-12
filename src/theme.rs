//! Le vocabulaire du serveur : les mots que les joueurs lisent hors du site, dans un e-mail
//! ou une notification.
//!
//! C'est le pendant de `web/src/theme/neutre.ts`, qui porte le vocabulaire de l'interface.
//! Changer d'univers, c'est changer les deux.
//!
//! Règle : un message ne dit jamais qui écrit, ni ce qui est écrit.

/// Le nom du site, tel que le voient les joueurs (expéditeur des e-mails, titre des
/// notifications).
pub const NOM_DU_SITE: &str = "Correspondance";

/// La notification du navigateur, à l'arrivée d'un pli.
pub const NOTIFICATION_ARRIVEE: &str = "Un pli vous attend.";

/// L'e-mail envoyé à l'arrivée d'un pli.
pub fn email_arrivee(adresse_reception: &str) -> (String, String) {
    (
        "Un pli vous attend".to_owned(),
        format!("Un pli vous attend.\n\n{adresse_reception}\n"),
    )
}

/// L'e-mail de rappel, quand un pli reste fermé.
pub fn email_rappel(adresse_reception: &str) -> (String, String) {
    (
        "Un pli vous attend toujours".to_owned(),
        format!("Un pli vous attend toujours.\n\n{adresse_reception}\n"),
    )
}
