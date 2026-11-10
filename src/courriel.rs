//! L'envoi des e-mails, par la boîte mail du MJ (SMTP).
//!
//! Variables d'environnement :
//! * `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` : le serveur d'envoi et ses identifiants ;
//! * `SMTP_PORT` : 465 par défaut (connexion chiffrée d'emblée), ou 587 ;
//! * `MAIL_FROM` : l'adresse d'expédition, si elle diffère de `SMTP_USER` (un alias).
//!
//! Sans `SMTP_HOST`, hors du site en ligne, l'e-mail n'est pas envoyé : il est écrit
//! dans les journaux du serveur. Cela permet de développer et d'essayer un aperçu
//! sans identifiants.

use lettre::message::Mailbox;
use lettre::message::header::ContentType;
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};

use crate::erreur::Erreur;

pub struct Courriel {
    pub destinataire: String,
    pub sujet: String,
    pub texte: String,
}

/// Le nom d'expéditeur que voient les joueurs.
const NOM_EXPEDITEUR: &str = "Correspondance";

pub async fn envoyer(courriel: Courriel) -> Result<(), Erreur> {
    let Ok(hote) = std::env::var("SMTP_HOST") else {
        return consigner(courriel);
    };
    let utilisateur = variable("SMTP_USER")?;
    let mot_de_passe = variable("SMTP_PASS")?;
    let port: u16 = std::env::var("SMTP_PORT")
        .ok()
        .and_then(|port| port.parse().ok())
        .unwrap_or(465);
    let expediteur = std::env::var("MAIL_FROM").unwrap_or_else(|_| utilisateur.clone());

    let message = Message::builder()
        .from(Mailbox::new(
            Some(NOM_EXPEDITEUR.to_owned()),
            expediteur.parse().map_err(Erreur::interne)?,
        ))
        .to(Mailbox::new(
            None,
            courriel.destinataire.parse().map_err(Erreur::interne)?,
        ))
        .subject(courriel.sujet)
        .header(ContentType::TEXT_PLAIN)
        .body(courriel.texte)
        .map_err(Erreur::interne)?;

    // 465 : chiffré dès la connexion. Tout autre port : chiffrement demandé ensuite (STARTTLS).
    let transport = if port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&hote)
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&hote)
    }
    .map_err(Erreur::interne)?
    .port(port)
    .credentials(Credentials::new(utilisateur, mot_de_passe))
    .build();

    transport.send(message).await.map_err(Erreur::interne)?;
    Ok(())
}

/// Sans serveur d'envoi : écrit l'e-mail dans les journaux, sauf sur le site en ligne.
fn consigner(courriel: Courriel) -> Result<(), Erreur> {
    if std::env::var("VERCEL_ENV").as_deref() == Ok("production") {
        return Err(Erreur::interne("SMTP_HOST manquant : aucun e-mail ne peut partir"));
    }
    eprintln!(
        "--- e-mail non envoyé (pas de SMTP_HOST) ---\nÀ : {}\nSujet : {}\n\n{}\n---",
        courriel.destinataire, courriel.sujet, courriel.texte
    );
    Ok(())
}

fn variable(nom: &str) -> Result<String, Erreur> {
    std::env::var(nom).map_err(|_| Erreur::interne(format!("{nom} manquant")))
}
