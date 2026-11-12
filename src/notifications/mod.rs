//! Les notifications : les choix de chaque compte, ses navigateurs abonnés, et l'envoi.
//!
//! Ce module est partagé par les deux portes : un joueur et le MJ choisissent leurs canaux
//! de la même façon. Ses traitements prennent l'identifiant d'un compte, que chaque porte
//! retrouve à partir de sa preuve d'identité ([`Joueur`](crate::acces::Joueur) ou
//! [`Mj`](crate::acces::Mj)). Il ne lit jamais le courrier.
//!
//! L'envoi lui-même est fait par la tâche planifiée (`src/taches/`).

pub mod chiffrement;
pub mod envoi;

use axum::Json;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use crate::erreur::Erreur;
use chiffrement::Vapid;

/// Les canaux choisis par un compte.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct MesNotifications {
    /// Faux tant que le compte n'a pas fait son premier choix (« Plus tard » compte).
    pub choisi: bool,
    /// Vrai dès qu'au moins un navigateur de ce compte est abonné.
    pub navigateur: bool,
    pub email_arrivee: bool,
    pub email_rappel: bool,
    /// Le délai du rappel, en heures.
    pub rappel_heures: i32,
    /// Le nombre de navigateurs abonnés, tous appareils confondus.
    pub navigateurs_abonnes: i32,
}

/// Les choix par e-mail. Le canal du navigateur, lui, s'ouvre et se ferme appareil par
/// appareil, en s'abonnant ou en se désabonnant : il n'est pas dans ce choix, pour qu'un
/// choix fait sur l'ordinateur ne coupe pas le téléphone.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ChoixNotifications {
    pub email_arrivee: bool,
    pub email_rappel: bool,
    pub rappel_heures: i32,
}

/// Un navigateur qui s'abonne : ce que donne `PushSubscription.toJSON()`.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct AbonnementNavigateur {
    pub endpoint: String,
    pub keys: ClesNavigateur,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct ClesNavigateur {
    pub p256dh: String,
    pub auth: String,
}

/// Un navigateur qui se désabonne.
#[derive(Deserialize, TS)]
#[ts(export)]
pub struct FinAbonnement {
    pub endpoint: String,
}

/// La clé publique du site, que le navigateur demande pour s'abonner.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct CleNotifications {
    /// Vide si les notifications du navigateur ne sont pas configurées.
    pub cle: Option<String>,
}

/// Le nombre de choses qui attendent : pour la pastille.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Pastille {
    pub nombre: i32,
}

/// `GET /api/notifications/cle`, sans connexion : la clé est publique.
pub async fn cle() -> Result<Json<CleNotifications>, Erreur> {
    let vapid = Vapid::depuis_l_environnement()?;
    Ok(Json(CleNotifications {
        cle: vapid.as_ref().map(|vapid| vapid.publique().to_owned()),
    }))
}

pub async fn lire(pool: &PgPool, compte_id: Uuid) -> Result<MesNotifications, Erreur> {
    let ligne = sqlx::query!(
        r#"
        select
            pr.choisi_le is not null as "choisi!",
            coalesce(pr.navigateur, false) as "navigateur!",
            coalesce(pr.email_arrivee, false) as "email_arrivee!",
            coalesce(pr.email_rappel, false) as "email_rappel!",
            coalesce(pr.rappel_heures, 24) as "rappel_heures!",
            (select count(*)::int from abonnements_navigateur a where a.compte_id = c.id)
                as "navigateurs_abonnes!"
        from comptes c
        left join preferences_notification pr on pr.compte_id = c.id
        where c.id = $1
        "#,
        compte_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(MesNotifications {
        choisi: ligne.choisi,
        navigateur: ligne.navigateur,
        email_arrivee: ligne.email_arrivee,
        email_rappel: ligne.email_rappel,
        rappel_heures: ligne.rappel_heures,
        navigateurs_abonnes: ligne.navigateurs_abonnes,
    })
}

/// Enregistre le choix du compte. Tout à faux, c'est « Plus tard » : le choix est fait,
/// on ne le repropose pas. Les navigateurs abonnés ne sont pas touchés.
pub async fn choisir(
    pool: &PgPool,
    compte_id: Uuid,
    choix: &ChoixNotifications,
) -> Result<MesNotifications, Erreur> {
    if !(1..=168).contains(&choix.rappel_heures) {
        return Err(Erreur::Refus("Le rappel se règle entre 1 heure et 7 jours."));
    }

    sqlx::query!(
        r#"
        insert into preferences_notification
            (compte_id, email_arrivee, email_rappel, rappel_heures, choisi_le)
        values ($1, $2, $3, $4, now())
        on conflict (compte_id) do update set
            email_arrivee = excluded.email_arrivee,
            email_rappel = excluded.email_rappel,
            rappel_heures = excluded.rappel_heures,
            choisi_le = now()
        "#,
        compte_id,
        choix.email_arrivee,
        choix.email_rappel,
        choix.rappel_heures,
    )
    .execute(pool)
    .await?;

    lire(pool, compte_id).await
}

/// Enregistre le navigateur courant. S'il était déjà abonné pour un autre compte
/// (ordinateur partagé), il passe à celui-ci.
pub async fn abonner(
    pool: &PgPool,
    compte_id: Uuid,
    abonnement: &AbonnementNavigateur,
) -> Result<(), Erreur> {
    verifier_endpoint(&abonnement.endpoint)?;
    let cles_valables = |cle: &str| !cle.is_empty() && cle.len() <= 200;
    if !cles_valables(&abonnement.keys.p256dh) || !cles_valables(&abonnement.keys.auth) {
        return Err(Erreur::Refus("Ce navigateur ne peut pas recevoir de notifications."));
    }

    let mut transaction = pool.begin().await?;
    sqlx::query!(
        r#"
        insert into abonnements_navigateur (compte_id, endpoint, cle_p256dh, cle_auth)
        values ($1, $2, $3, $4)
        on conflict (endpoint) do update set
            compte_id = excluded.compte_id,
            cle_p256dh = excluded.cle_p256dh,
            cle_auth = excluded.cle_auth
        "#,
        compte_id,
        abonnement.endpoint,
        abonnement.keys.p256dh,
        abonnement.keys.auth,
    )
    .execute(&mut *transaction)
    .await?;
    sqlx::query!(
        r#"
        insert into preferences_notification (compte_id, navigateur) values ($1, true)
        on conflict (compte_id) do update set navigateur = true
        "#,
        compte_id,
    )
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(())
}

/// Retire le navigateur courant. Sans plus aucun navigateur, le canal est coupé.
pub async fn desabonner(pool: &PgPool, compte_id: Uuid, fin: &FinAbonnement) -> Result<(), Erreur> {
    sqlx::query!(
        "delete from abonnements_navigateur where compte_id = $1 and endpoint = $2",
        compte_id,
        fin.endpoint,
    )
    .execute(pool)
    .await?;
    envoi::retirer_si_dernier(pool, compte_id).await
}

/// Le serveur enverra des requêtes à cette adresse : elle doit être celle d'un service
/// de notifications, donc en https. Hors du site en ligne, le service factice des essais
/// (sur cette machine) est aussi accepté.
fn verifier_endpoint(endpoint: &str) -> Result<(), Erreur> {
    let refus = Erreur::Refus("Ce navigateur ne peut pas recevoir de notifications.");
    let Ok(adresse) = reqwest::Url::parse(endpoint) else {
        return Err(refus);
    };
    let local = matches!(adresse.host_str(), Some("localhost" | "127.0.0.1"));
    let permis = match adresse.scheme() {
        "https" => !local,
        "http" => local && !envoi::sur_le_site_en_ligne(),
        _ => false,
    };
    if !permis || endpoint.len() > 1000 {
        return Err(refus);
    }
    Ok(())
}

/// L'adresse publique du site, pour les liens des e-mails. La tâche planifiée n'a pas
/// de requête de navigateur d'où la déduire.
///
/// `SITE_URL` si elle est donnée ; sinon l'adresse que Vercel fournit au site en ligne
/// ou à l'aperçu ; en local, l'interface de développement.
pub fn adresse_du_site() -> String {
    if let Ok(adresse) = std::env::var("SITE_URL") {
        return adresse.trim_end_matches('/').to_owned();
    }
    let vercel = match std::env::var("VERCEL_ENV").as_deref() {
        Ok("production") => std::env::var("VERCEL_PROJECT_PRODUCTION_URL").ok(),
        Ok(_) => std::env::var("VERCEL_BRANCH_URL")
            .or_else(|_| std::env::var("VERCEL_URL"))
            .ok(),
        Err(_) => None,
    };
    match vercel {
        Some(hote) => format!("https://{hote}"),
        None => "http://localhost:5173".to_owned(),
    }
}
