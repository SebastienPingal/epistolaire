//! Prévenir un compte : par e-mail, ou sur ses navigateurs abonnés.
//!
//! Garde-fou : hors du site en ligne (`VERCEL_ENV` différent de `production`, ou absent),
//! rien ne part vers un autre compte que celui du MJ. Le message est écrit dans le journal
//! du serveur à la place. Un essai sur un aperçu ou en local ne prévient donc jamais
//! un vrai joueur, même si les aperçus partagent la base du site en ligne.

use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use super::chiffrement::{self, Vapid};
use crate::courriel::{self, Courriel};
use crate::erreur::Erreur;
use crate::modele::Role;

/// Ce que le navigateur reçoit, une fois déchiffré. Jamais l'expéditeur ni le contenu
/// d'un pli : le service worker (`web/public/sw.js`) l'affiche tel quel.
#[derive(Serialize)]
pub struct Notification {
    pub titre: String,
    pub texte: String,
    /// L'écran à ouvrir quand on touche la notification.
    pub url: String,
}

/// Le compte à prévenir.
pub struct Destinataire {
    pub compte_id: Uuid,
    pub email: String,
    pub role: Role,
}

impl Destinataire {
    /// Hors du site en ligne, seul le MJ reçoit vraiment quelque chose.
    fn retenu(&self) -> bool {
        self.role != Role::Mj && !sur_le_site_en_ligne()
    }
}

pub fn sur_le_site_en_ligne() -> bool {
    std::env::var("VERCEL_ENV").as_deref() == Ok("production")
}

/// Envoie un e-mail. Renvoie faux s'il n'a pas pu partir.
pub async fn email(destinataire: &Destinataire, sujet: String, texte: String) -> bool {
    if destinataire.retenu() {
        eprintln!(
            "--- e-mail retenu (hors du site en ligne) ---\nÀ : {}\nSujet : {sujet}\n\n{texte}\n---",
            destinataire.email
        );
        return true;
    }
    match courriel::envoyer(Courriel { destinataire: destinataire.email.clone(), sujet, texte }).await {
        Ok(()) => true,
        Err(erreur) => {
            eprintln!("e-mail non parti vers le compte {} : {erreur:?}", destinataire.compte_id);
            false
        }
    }
}

/// Ce qu'il est advenu d'un envoi vers les navigateurs d'un compte.
#[derive(Default)]
pub struct Bilan {
    pub remis: usize,
    pub echecs: usize,
}

/// Envoie la notification à chacun des navigateurs abonnés du compte.
/// Un abonnement que le service dit disparu (404 ou 410) est supprimé.
pub async fn navigateurs(
    pool: &PgPool,
    vapid: Option<&Vapid>,
    destinataire: &Destinataire,
    notification: &Notification,
) -> Result<Bilan, Erreur> {
    let abonnements = sqlx::query!(
        "select id, endpoint, cle_p256dh, cle_auth from abonnements_navigateur where compte_id = $1",
        destinataire.compte_id,
    )
    .fetch_all(pool)
    .await?;

    let mut bilan = Bilan::default();
    if abonnements.is_empty() {
        return Ok(bilan);
    }
    let message = serde_json::to_vec(notification).map_err(Erreur::interne)?;

    if destinataire.retenu() {
        eprintln!(
            "--- notification retenue (hors du site en ligne) ---\nÀ : {} ({} navigateur(s))\n{}\n---",
            destinataire.email,
            abonnements.len(),
            String::from_utf8_lossy(&message)
        );
        bilan.remis = abonnements.len();
        return Ok(bilan);
    }

    let Some(vapid) = vapid else {
        eprintln!("notifications du navigateur indisponibles : clés VAPID absentes");
        bilan.echecs = abonnements.len();
        return Ok(bilan);
    };

    for abonnement in abonnements {
        match pousser(vapid, &abonnement.endpoint, &abonnement.cle_p256dh, &abonnement.cle_auth, &message).await {
            Ok(Remise::Faite) => bilan.remis += 1,
            Ok(Remise::Disparu) => {
                sqlx::query!("delete from abonnements_navigateur where id = $1", abonnement.id)
                    .execute(pool)
                    .await?;
                retirer_si_dernier(pool, destinataire.compte_id).await?;
            }
            Err(erreur) => {
                eprintln!("notification non remise ({}) : {erreur:?}", abonnement.id);
                bilan.echecs += 1;
            }
        }
    }
    Ok(bilan)
}

/// Sans aucun navigateur abonné, le canal n'a plus de sens : il est coupé.
pub async fn retirer_si_dernier(pool: &PgPool, compte_id: Uuid) -> Result<(), Erreur> {
    sqlx::query!(
        r#"
        update preferences_notification set navigateur = false
        where compte_id = $1
          and not exists (select 1 from abonnements_navigateur where compte_id = $1)
        "#,
        compte_id,
    )
    .execute(pool)
    .await?;
    Ok(())
}

enum Remise {
    Faite,
    /// Le navigateur s'est désabonné, ou l'abonnement a expiré.
    Disparu,
}

/// Remet un message chiffré au service de notifications d'un navigateur.
async fn pousser(
    vapid: &Vapid,
    endpoint: &str,
    p256dh: &str,
    auth: &str,
    message: &[u8],
) -> Result<Remise, Erreur> {
    let corps = chiffrement::chiffrer(message, p256dh, auth)?;
    let reponse = client()
        .post(endpoint)
        .header("Authorization", vapid.entete(endpoint, chrono::Utc::now().timestamp())?)
        .header("Content-Encoding", "aes128gcm")
        .header("Content-Type", "application/octet-stream")
        // Gardé un jour par le service si le téléphone est éteint.
        .header("TTL", "86400")
        .header("Urgency", "normal")
        // Plusieurs arrivées en attente n'en font qu'une.
        .header("Topic", "pli")
        .body(corps)
        .send()
        .await
        .map_err(Erreur::interne)?;

    match reponse.status().as_u16() {
        200..=299 => Ok(Remise::Faite),
        404 | 410 => Ok(Remise::Disparu),
        statut => {
            let detail = reponse.text().await.unwrap_or_default();
            Err(Erreur::interne(format!("service de notifications : {statut} {detail}")))
        }
    }
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default()
    })
}
