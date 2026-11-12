//! La troisième porte : les tâches planifiées, sous `/api/taches`.
//!
//! Personne ne s'y connecte. Vercel les appelle selon les planifications de `vercel.json`,
//! seulement sur le site en ligne, en joignant l'en-tête `Authorization: Bearer <CRON_SECRET>`.
//! Tout appel sans ce secret est refusé (401), qu'il vienne d'un inconnu ou d'un joueur
//! connecté.
//!
//! Une tâche ne livre rien : un pli est arrivé dès que sa date est passée. Elle ne fait
//! que prévenir de ce qui est déjà arrivé.
//!
//! Règles :
//! * on marque **avant** d'envoyer, sous verrou : deux passages simultanés ne préviennent
//!   jamais deux fois. On préfère manquer une alerte plutôt qu'en envoyer deux ;
//! * hors du site en ligne, rien ne part vers un joueur (voir `notifications::envoi`).

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::base;
use crate::erreur::Erreur;
use crate::modele::Role;
use crate::notifications::chiffrement::Vapid;
use crate::notifications::envoi::{self, Destinataire, Notification};
use crate::notifications::adresse_du_site;
use crate::theme;

/// Le MJ est alerté quand une date de livraison proposée est à moins de ce délai,
/// et qu'il n'a pas encore traité la lettre (décision du MJ, 12 novembre).
const MINUTES_ALERTE_MJ: i32 = 120;

pub fn routes() -> Router {
    Router::new().route("/notifications", get(notifications))
}

/// La preuve qu'un appel vient de la planification : il connaît `CRON_SECRET`.
pub struct Planification;

impl<S: Send + Sync> FromRequestParts<S> for Planification {
    type Rejection = Erreur;

    async fn from_request_parts(parts: &mut Parts, _etat: &S) -> Result<Self, Erreur> {
        let attendu = std::env::var("CRON_SECRET").unwrap_or_default();
        if attendu.trim().is_empty() {
            eprintln!("tâche refusée : CRON_SECRET n'est pas défini");
            return Err(Erreur::NonConnecte);
        }
        let recu = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|valeur| valeur.to_str().ok())
            .unwrap_or_default();

        // Comparer des empreintes : la durée de la comparaison ne dit rien du secret.
        let empreinte = |texte: &str| Sha256::digest(texte.as_bytes());
        if empreinte(recu) != empreinte(&format!("Bearer {attendu}")) {
            return Err(Erreur::NonConnecte);
        }
        Ok(Planification)
    }
}

/// Ce que la tâche a fait, pour le journal.
#[derive(Debug, Default, Serialize)]
pub struct Resume {
    /// Les comptes prévenus d'une arrivée.
    pub arrivees: usize,
    /// Les comptes qui ont reçu un rappel.
    pub rappels: usize,
    /// Les lettres arrivées dans la file du MJ.
    pub lettres_nouvelles: usize,
    /// Les lettres dont la date proposée approche.
    pub lettres_proches: usize,
    /// Les envois qui ont échoué.
    pub echecs: usize,
}

/// `GET /api/taches/notifications` : prévient de tout ce qui est arrivé depuis le passage
/// précédent.
pub async fn notifications(_: Planification) -> Result<Json<Resume>, Erreur> {
    let pool = base::pool().await?;
    // Des clés mal posées ne doivent pas empêcher les e-mails de partir.
    let vapid = Vapid::depuis_l_environnement().unwrap_or_else(|erreur| {
        eprintln!("clés VAPID inutilisables : {erreur:?}");
        None
    });
    let site = adresse_du_site();
    let mut resume = Resume::default();

    prevenir_des_arrivees(pool, vapid.as_ref(), &site, &mut resume).await?;
    rappeler(pool, &site, &mut resume).await?;
    prevenir_le_mj(pool, vapid.as_ref(), &site, &mut resume).await?;

    println!("tâche des notifications : {resume:?}");
    Ok(Json(resume))
}

/// Les plis arrivés depuis le dernier passage : chaque compte concerné est prévenu
/// une seule fois, selon ses choix.
async fn prevenir_des_arrivees(
    pool: &PgPool,
    vapid: Option<&Vapid>,
    site: &str,
    resume: &mut Resume,
) -> Result<(), Erreur> {
    // Tout exemplaire arrivé est marqué, même celui d'un PNJ (qui n'a pas de compte) :
    // il ne repassera plus. Seuls les joueurs dont le pli est encore fermé sont prévenus.
    let comptes = sqlx::query!(
        r#"
        with arrives as (
            select e.id
            from exemplaires e
            where e.acheminement = 'en_route'
              and e.livraison_le <= now()
              and e.notifie_le is null
            for update skip locked
        ),
        marques as (
            update exemplaires e
            set notifie_le = now()
            from arrives a
            where e.id = a.id
            returning e.destinataire_id, e.ouvert_le, e.detruit_le
        )
        select distinct
            c.id as "compte_id!",
            c.email::text as "email!",
            c.role as "role!: Role",
            coalesce(pr.navigateur, false) as "navigateur!",
            coalesce(pr.email_arrivee, false) as "email_arrivee!"
        from marques m
        join personnages p on p.id = m.destinataire_id
        join comptes c on c.id = p.compte_id
        left join preferences_notification pr on pr.compte_id = c.id
        where m.ouvert_le is null and m.detruit_le is null
        "#,
    )
    .fetch_all(pool)
    .await?;

    let reception = format!("{site}/reception");
    for compte in comptes {
        if !compte.navigateur && !compte.email_arrivee {
            continue;
        }
        let destinataire = Destinataire {
            compte_id: compte.compte_id,
            email: compte.email,
            role: compte.role,
        };
        if compte.email_arrivee {
            let (sujet, texte) = theme::email_arrivee(&reception);
            if !envoi::email(&destinataire, sujet, texte).await {
                resume.echecs += 1;
            }
        }
        if compte.navigateur {
            let notification = Notification {
                titre: theme::NOM_DU_SITE.to_owned(),
                texte: theme::NOTIFICATION_ARRIVEE.to_owned(),
                url: "/reception".to_owned(),
            };
            resume.echecs += envoi::navigateurs(pool, vapid, &destinataire, &notification)
                .await?
                .echecs;
        }
        resume.arrivees += 1;
    }
    Ok(())
}

/// Les plis restés fermés plus longtemps que le délai choisi : un seul e-mail par compte,
/// et un seul rappel par pli.
async fn rappeler(pool: &PgPool, site: &str, resume: &mut Resume) -> Result<(), Erreur> {
    let comptes = sqlx::query!(
        r#"
        with dus as (
            select e.id
            from exemplaires e
            join personnages p on p.id = e.destinataire_id
            join preferences_notification pr on pr.compte_id = p.compte_id
            where pr.email_rappel
              and e.acheminement = 'en_route'
              and e.notifie_le is not null
              and e.ouvert_le is null
              and e.detruit_le is null
              and e.rappele_le is null
              and e.livraison_le <= now() - make_interval(hours => pr.rappel_heures)
            for update of e skip locked
        ),
        marques as (
            update exemplaires e
            set rappele_le = now()
            from dus d
            where e.id = d.id
            returning e.destinataire_id
        )
        select distinct
            c.id as "compte_id!",
            c.email::text as "email!",
            c.role as "role!: Role"
        from marques m
        join personnages p on p.id = m.destinataire_id
        join comptes c on c.id = p.compte_id
        "#,
    )
    .fetch_all(pool)
    .await?;

    let reception = format!("{site}/reception");
    for compte in comptes {
        let destinataire = Destinataire {
            compte_id: compte.compte_id,
            email: compte.email,
            role: compte.role,
        };
        let (sujet, texte) = theme::email_rappel(&reception);
        if envoi::email(&destinataire, sujet, texte).await {
            resume.rappels += 1;
        } else {
            resume.echecs += 1;
        }
    }
    Ok(())
}

/// Le MJ : les nouvelles lettres de sa file, et celles dont la date proposée approche.
/// Tout tient dans un seul message.
async fn prevenir_le_mj(
    pool: &PgPool,
    vapid: Option<&Vapid>,
    site: &str,
    resume: &mut Resume,
) -> Result<(), Erreur> {
    let nouvelles = sqlx::query_scalar!(
        r#"
        with nouvelles as (
            select id from plis
            where etat = 'a_traiter' and mj_prevenu_le is null
            for update skip locked
        )
        update plis p set mj_prevenu_le = now()
        from nouvelles n
        where p.id = n.id
        returning p.id
        "#,
    )
    .fetch_all(pool)
    .await?
    .len();

    // Une lettre à la gazette attend un numéro : sa date proposée n'appelle pas d'alerte.
    let proches = sqlx::query_scalar!(
        r#"
        with proches as (
            select id from plis
            where etat = 'a_traiter'
              and mj_alerte_le is null
              and destinataire_genre is distinct from 'gazette'
              and date_proposee <= now() + make_interval(mins => $1)
            for update skip locked
        )
        update plis p set mj_alerte_le = now()
        from proches x
        where p.id = x.id
        returning p.id
        "#,
        MINUTES_ALERTE_MJ,
    )
    .fetch_all(pool)
    .await?
    .len();

    resume.lettres_nouvelles = nouvelles;
    resume.lettres_proches = proches;
    if nouvelles == 0 && proches == 0 {
        return Ok(());
    }

    let mut lignes = Vec::new();
    match nouvelles {
        0 => {}
        1 => lignes.push("1 nouvelle lettre à traiter.".to_owned()),
        n => lignes.push(format!("{n} nouvelles lettres à traiter.")),
    }
    match proches {
        0 => {}
        1 => lignes.push("1 lettre approche de sa date de livraison proposée.".to_owned()),
        n => lignes.push(format!("{n} lettres approchent de leur date de livraison proposée.")),
    }
    let texte = lignes.join("\n");

    let comptes = sqlx::query!(
        r#"
        select
            c.id,
            c.email::text as "email!",
            coalesce(pr.navigateur, false) as "navigateur!",
            coalesce(pr.email_arrivee, false) as "email_arrivee!"
        from comptes c
        left join preferences_notification pr on pr.compte_id = c.id
        where c.role = 'mj'
        "#,
    )
    .fetch_all(pool)
    .await?;

    for compte in comptes {
        let destinataire = Destinataire { compte_id: compte.id, email: compte.email, role: Role::Mj };
        if compte.email_arrivee {
            let sujet = if proches > 0 { "Une date approche" } else { "Courrier à traiter" };
            let corps = format!("{texte}\n\n{site}/mj/a-traiter\n");
            if !envoi::email(&destinataire, sujet.to_owned(), corps).await {
                resume.echecs += 1;
            }
        }
        if compte.navigateur {
            let notification = Notification {
                titre: theme::NOM_DU_SITE.to_owned(),
                texte: texte.clone(),
                url: "/mj/a-traiter".to_owned(),
            };
            resume.echecs += envoi::navigateurs(pool, vapid, &destinataire, &notification)
                .await?
                .echecs;
        }
    }
    Ok(())
}
