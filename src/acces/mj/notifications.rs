//! Les notifications du MJ : ses canaux, ses navigateurs abonnés, la pastille d'À traiter,
//! et un essai qu'il s'envoie à lui-même. Le traitement commun est dans `crate::notifications`.

use axum::Json;
use axum::http::StatusCode;

use super::super::Mj;
use crate::base;
use crate::erreur::Erreur;
use crate::modele::Role;
use crate::notifications::chiffrement::Vapid;
use crate::notifications::envoi::{self, Destinataire, Notification};
use crate::notifications::{
    self, AbonnementNavigateur, ChoixNotifications, FinAbonnement, MesNotifications, Pastille,
};
use crate::theme;

pub async fn lire(mj: Mj) -> Result<Json<MesNotifications>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(notifications::lire(pool, mj.compte_id()).await?))
}

pub async fn choisir(
    mj: Mj,
    Json(choix): Json<ChoixNotifications>,
) -> Result<Json<MesNotifications>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(notifications::choisir(pool, mj.compte_id(), &choix).await?))
}

pub async fn abonner(
    mj: Mj,
    Json(abonnement): Json<AbonnementNavigateur>,
) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    notifications::abonner(pool, mj.compte_id(), &abonnement).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn desabonner(mj: Mj, Json(fin): Json<FinAbonnement>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    notifications::desabonner(pool, mj.compte_id(), &fin).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Le nombre de lettres dans la file À traiter.
pub async fn pastille(_mj: Mj) -> Result<Json<Pastille>, Erreur> {
    let pool = base::pool().await?;
    let nombre = sqlx::query_scalar!(
        r#"select count(*)::int as "nombre!" from plis where etat = 'a_traiter'"#
    )
    .fetch_one(pool)
    .await?;
    Ok(Json(Pastille { nombre }))
}

/// Ce qu'a donné un essai.
#[derive(serde::Serialize, ts_rs::TS)]
#[ts(export)]
pub struct EssaiNotifications {
    /// Les navigateurs du MJ qui ont reçu la notification.
    pub navigateurs: i32,
    /// Ceux qui ne l'ont pas reçue.
    pub echecs: i32,
    /// Vrai si un e-mail est parti.
    pub email: bool,
}

/// Envoie au MJ lui-même une notification et un e-mail d'essai, par ses canaux choisis,
/// sur le même chemin que la tâche planifiée. Sert à vérifier un appareil.
pub async fn essayer(mj: Mj) -> Result<Json<EssaiNotifications>, Erreur> {
    let pool = base::pool().await?;
    let compte = sqlx::query!(
        r#"
        select c.email::text as "email!", coalesce(pr.email_arrivee, false) as "email_arrivee!"
        from comptes c
        left join preferences_notification pr on pr.compte_id = c.id
        where c.id = $1
        "#,
        mj.compte_id(),
    )
    .fetch_one(pool)
    .await?;
    let destinataire = Destinataire { compte_id: mj.compte_id(), email: compte.email, role: Role::Mj };

    let vapid = Vapid::depuis_l_environnement()?;
    let bilan = envoi::navigateurs(
        pool,
        vapid.as_ref(),
        &destinataire,
        &Notification {
            titre: theme::NOM_DU_SITE.to_owned(),
            texte: "Essai : les notifications arrivent bien sur cet appareil.".to_owned(),
            url: "/mj/reglages".to_owned(),
        },
    )
    .await?;

    let email = compte.email_arrivee
        && envoi::email(
            &destinataire,
            "Essai des notifications".to_owned(),
            format!(
                "Essai : les e-mails du site arrivent bien.\n\n{}/mj/reglages\n",
                notifications::adresse_du_site()
            ),
        )
        .await;

    Ok(Json(EssaiNotifications {
        navigateurs: bilan.remis as i32,
        echecs: bilan.echecs as i32,
        email,
    }))
}
