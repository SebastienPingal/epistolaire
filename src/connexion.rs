//! Connexion par e-mail : un lien et un code à 6 chiffres, puis une session de plusieurs mois.
//!
//! * Seules les adresses enregistrées par le MJ peuvent se connecter. Une adresse inconnue
//!   reçoit la même réponse qu'une adresse connue : le site ne dit pas qui a un compte.
//! * Le compte du MJ se crée seul à sa première demande, à partir de la variable `MJ_EMAIL`.
//! * La base ne garde que des empreintes du code, du lien et de la session.
//!
//! C'est aussi ici que se fabriquent les preuves d'identité [`Joueur`] et [`Mj`]
//! exigées par les portes d'accès.

use axum::Json;
use axum::extract::FromRequestParts;
use axum::http::header::{COOKIE, HOST, SET_COOKIE};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use crate::acces::{Joueur, Mj};
use crate::base;
use crate::courriel::{self, Courriel};
use crate::erreur::Erreur;
use crate::modele::Role;

/// Durée de validité du lien et du code.
const MINUTES_DEMANDE: i32 = 15;
/// Codes faux tolérés avant qu'une demande ne soit plus utilisable.
const ESSAIS_MAX: i32 = 5;
/// Demandes acceptées pour un même compte pendant la durée de validité.
const DEMANDES_MAX: i64 = 5;
/// Une session dure ce nombre de jours après la dernière visite.
const JOURS_SESSION: i32 = 180;
/// Le navigateur garde le cookie longtemps : c'est la base qui décide de l'expiration.
const SECONDES_COOKIE: i64 = 400 * 24 * 3600;
const NOM_COOKIE: &str = "session";

const REFUS_CODE: Erreur = Erreur::Refus("Ce code est incorrect ou a expiré.");
const REFUS_LIEN: Erreur = Erreur::Refus("Ce lien a déjà servi ou a expiré.");

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct DemandeConnexion {
    pub email: String,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct CodeConnexion {
    pub email: String,
    pub code: String,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct LienConnexion {
    pub jeton: String,
}

/// Qui est connecté.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Moi {
    pub role: Role,
    /// Le personnage incarné. Vide pour le MJ, et pour un joueur sans personnage.
    pub personnage: Option<MonPersonnage>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct MonPersonnage {
    pub id: Uuid,
    pub nom: String,
}

// ---------------------------------------------------------------------------
// Les traitements
// ---------------------------------------------------------------------------

/// Envoie un lien et un code à l'adresse donnée, si elle a un compte.
pub async fn demander(
    entetes: HeaderMap,
    Json(demande): Json<DemandeConnexion>,
) -> Result<StatusCode, Erreur> {
    let email = normaliser(&demande.email)
        .ok_or(Erreur::Refus("Cette adresse n'a pas la forme d'une adresse e-mail."))?;
    let site = adresse_du_site(&entetes)?;
    let pool = base::pool().await?;

    faire_le_menage(pool).await?;

    let Some(compte_id) = trouver_compte(pool, &email).await? else {
        return Ok(StatusCode::NO_CONTENT);
    };

    let recentes = sqlx::query_scalar!(
        r#"
        select count(*) as "nombre!"
        from demandes_connexion
        where compte_id = $1 and cree_le > now() - make_interval(mins => $2)
        "#,
        compte_id,
        MINUTES_DEMANDE,
    )
    .fetch_one(pool)
    .await?;
    if recentes >= DEMANDES_MAX {
        return Ok(StatusCode::NO_CONTENT);
    }

    let id = Uuid::now_v7();
    let code = code_aleatoire();
    let jeton = jeton_aleatoire();

    sqlx::query!(
        r#"
        insert into demandes_connexion (id, compte_id, code_hash, lien_hash, expire_le)
        values ($1, $2, $3, $4, now() + make_interval(mins => $5))
        "#,
        id,
        compte_id,
        empreinte_du_code(id, &code),
        empreinte(&jeton),
        MINUTES_DEMANDE,
    )
    .execute(pool)
    .await?;

    courriel::envoyer(Courriel {
        destinataire: email,
        sujet: "Votre code de connexion".to_owned(),
        texte: format!(
            "Bonjour,\n\n\
             Pour entrer, ouvrez ce lien :\n\
             {site}/connexion?jeton={jeton}\n\n\
             Ou saisissez ce code : {code}\n\n\
             Le lien et le code sont valables {MINUTES_DEMANDE} minutes et ne servent qu'une fois.\n\
             Si vous n'avez rien demandé, ignorez ce message.\n"
        ),
    })
    .await?;

    Ok(StatusCode::NO_CONTENT)
}

/// Ouvre une session à partir du code à 6 chiffres.
pub async fn verifier_code(
    entetes: HeaderMap,
    Json(saisie): Json<CodeConnexion>,
) -> Result<Response, Erreur> {
    let email = normaliser(&saisie.email).ok_or(REFUS_CODE)?;
    let code: String = saisie.code.chars().filter(char::is_ascii_digit).collect();
    let pool = base::pool().await?;

    let demandes = sqlx::query!(
        r#"
        select d.id, d.compte_id, d.code_hash
        from demandes_connexion d
        join comptes c on c.id = d.compte_id
        where c.email = $1::text::citext
          and d.utilisee_le is null
          and d.expire_le > now()
          and d.essais < $2
        order by d.cree_le desc
        "#,
        email,
        ESSAIS_MAX,
    )
    .fetch_all(pool)
    .await?;

    for demande in &demandes {
        if demande.code_hash == empreinte_du_code(demande.id, &code) {
            return ouvrir_session(pool, &entetes, demande.id, demande.compte_id, REFUS_CODE).await;
        }
    }

    // Code faux : l'essai compte pour toutes les demandes en cours de ce compte.
    let en_cours: Vec<Uuid> = demandes.iter().map(|demande| demande.id).collect();
    sqlx::query!(
        "update demandes_connexion set essais = essais + 1 where id = any($1)",
        &en_cours,
    )
    .execute(pool)
    .await?;

    Err(REFUS_CODE)
}

/// Ouvre une session à partir du lien reçu par e-mail.
pub async fn verifier_lien(
    entetes: HeaderMap,
    Json(saisie): Json<LienConnexion>,
) -> Result<Response, Erreur> {
    let pool = base::pool().await?;

    let demande = sqlx::query!(
        r#"
        select id, compte_id
        from demandes_connexion
        where lien_hash = $1 and utilisee_le is null and expire_le > now()
        "#,
        empreinte(&saisie.jeton),
    )
    .fetch_optional(pool)
    .await?
    .ok_or(REFUS_LIEN)?;

    ouvrir_session(pool, &entetes, demande.id, demande.compte_id, REFUS_LIEN).await
}

/// Qui suis-je ? L'interface le demande à chaque ouverture.
pub async fn moi(session: Session) -> Result<Json<Moi>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(lire_moi(pool, session.compte_id).await?))
}

pub async fn deconnecter(session: Session, entetes: HeaderMap) -> Result<Response, Erreur> {
    let pool = base::pool().await?;
    sqlx::query!("delete from sessions where id = $1", session.id)
        .execute(pool)
        .await?;

    Ok((
        [(SET_COOKIE, cookie("", 0, &entetes))],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// Les preuves d'identité
// ---------------------------------------------------------------------------

/// Une session valide. Tout traitement qui la demande exige d'être connecté.
pub struct Session {
    pub id: Uuid,
    pub compte_id: Uuid,
    pub role: Role,
}

impl<S: Send + Sync> FromRequestParts<S> for Session {
    type Rejection = Erreur;

    async fn from_request_parts(parts: &mut Parts, _etat: &S) -> Result<Self, Erreur> {
        let jeton = lire_cookie(&parts.headers).ok_or(Erreur::NonConnecte)?;
        let pool = base::pool().await?;

        let session = sqlx::query!(
            r#"
            select
                s.id,
                s.compte_id,
                c.role as "role: Role",
                s.vue_le < now() - interval '1 day' as "a_prolonger!"
            from sessions s
            join comptes c on c.id = s.compte_id
            where s.jeton_hash = $1 and s.expire_le > now()
            "#,
            empreinte(&jeton),
        )
        .fetch_optional(pool)
        .await?
        .ok_or(Erreur::NonConnecte)?;

        // Chaque visite repousse l'expiration. Une écriture par jour suffit.
        if session.a_prolonger {
            sqlx::query!(
                r#"
                update sessions
                set vue_le = now(), expire_le = now() + make_interval(days => $2)
                where id = $1
                "#,
                session.id,
                JOURS_SESSION,
            )
            .execute(pool)
            .await?;
        }

        Ok(Session {
            id: session.id,
            compte_id: session.compte_id,
            role: session.role,
        })
    }
}

impl<S: Send + Sync> FromRequestParts<S> for Mj {
    type Rejection = Erreur;

    async fn from_request_parts(parts: &mut Parts, etat: &S) -> Result<Self, Erreur> {
        let session = Session::from_request_parts(parts, etat).await?;
        if session.role != Role::Mj {
            return Err(Erreur::Interdit);
        }
        Ok(Mj::nouveau(session.compte_id))
    }
}

impl<S: Send + Sync> FromRequestParts<S> for Joueur {
    type Rejection = Erreur;

    async fn from_request_parts(parts: &mut Parts, etat: &S) -> Result<Self, Erreur> {
        let session = Session::from_request_parts(parts, etat).await?;
        if session.role != Role::Joueur {
            return Err(Erreur::Interdit);
        }

        let pool = base::pool().await?;
        let personnage_id = sqlx::query_scalar!(
            "select id from personnages where compte_id = $1",
            session.compte_id,
        )
        .fetch_optional(pool)
        .await?
        // Un joueur sans personnage n'a encore rien à voir.
        .ok_or(Erreur::Interdit)?;

        Ok(Joueur::nouveau(personnage_id))
    }
}

// ---------------------------------------------------------------------------
// Rouages
// ---------------------------------------------------------------------------

/// Marque la demande comme utilisée, crée la session et pose le cookie.
async fn ouvrir_session(
    pool: &PgPool,
    entetes: &HeaderMap,
    demande_id: Uuid,
    compte_id: Uuid,
    refus: Erreur,
) -> Result<Response, Erreur> {
    // Si deux requêtes arrivent ensemble avec la même demande, une seule passe.
    let marquee = sqlx::query!(
        "update demandes_connexion set utilisee_le = now() where id = $1 and utilisee_le is null",
        demande_id,
    )
    .execute(pool)
    .await?;
    if marquee.rows_affected() == 0 {
        return Err(refus);
    }

    let jeton = jeton_aleatoire();
    sqlx::query!(
        r#"
        insert into sessions (compte_id, jeton_hash, expire_le)
        values ($1, $2, now() + make_interval(days => $3))
        "#,
        compte_id,
        empreinte(&jeton),
        JOURS_SESSION,
    )
    .execute(pool)
    .await?;

    let moi = lire_moi(pool, compte_id).await?;
    Ok((
        [(SET_COOKIE, cookie(&jeton, SECONDES_COOKIE, entetes))],
        Json(moi),
    )
        .into_response())
}

async fn lire_moi(pool: &PgPool, compte_id: Uuid) -> Result<Moi, Erreur> {
    let ligne = sqlx::query!(
        r#"
        select c.role as "role: Role", p.id as "personnage_id?", p.nom as "personnage_nom?"
        from comptes c
        left join personnages p on p.compte_id = c.id
        where c.id = $1
        "#,
        compte_id,
    )
    .fetch_one(pool)
    .await?;

    Ok(Moi {
        role: ligne.role,
        personnage: match (ligne.personnage_id, ligne.personnage_nom) {
            (Some(id), Some(nom)) => Some(MonPersonnage { id, nom }),
            _ => None,
        },
    })
}

/// Le compte de cette adresse. Celui du MJ est créé à sa première demande.
async fn trouver_compte(pool: &PgPool, email: &str) -> Result<Option<Uuid>, Erreur> {
    let existant = sqlx::query_scalar!(
        "select id from comptes where email = $1::text::citext",
        email,
    )
    .fetch_optional(pool)
    .await?;
    if existant.is_some() {
        return Ok(existant);
    }

    let est_le_mj = std::env::var("MJ_EMAIL")
        .ok()
        .and_then(|adresse| normaliser(&adresse))
        .is_some_and(|adresse| adresse == email);
    if !est_le_mj {
        return Ok(None);
    }

    let cree = sqlx::query_scalar!(
        r#"
        insert into comptes (email, role) values ($1::text::citext, 'mj')
        on conflict (email) do update set email = excluded.email
        returning id
        "#,
        email,
    )
    .fetch_one(pool)
    .await?;
    Ok(Some(cree))
}

/// Efface les demandes et les sessions expirées.
async fn faire_le_menage(pool: &PgPool) -> Result<(), Erreur> {
    sqlx::query!("delete from demandes_connexion where expire_le < now() - interval '1 day'")
        .execute(pool)
        .await?;
    sqlx::query!("delete from sessions where expire_le < now()")
        .execute(pool)
        .await?;
    Ok(())
}

/// Met l'adresse en forme, ou la refuse si elle n'en a pas l'allure.
fn normaliser(email: &str) -> Option<String> {
    let email = email.trim().to_lowercase();
    let (avant, apres) = email.split_once('@')?;
    let valable = !avant.is_empty()
        && apres.contains('.')
        && !apres.starts_with('.')
        && !apres.ends_with('.')
        && !apres.contains('@')
        && email.len() <= 254
        && !email.chars().any(char::is_whitespace);
    valable.then_some(email)
}

fn code_aleatoire() -> String {
    format!("{:06}", rand::rng().random_range(0..1_000_000))
}

fn jeton_aleatoire() -> String {
    let mut octets = [0u8; 32];
    rand::rng().fill(&mut octets);
    URL_SAFE_NO_PAD.encode(octets)
}

fn empreinte(valeur: &str) -> String {
    format!("{:x}", Sha256::digest(valeur.as_bytes()))
}

/// L'empreinte d'un code dépend de sa demande : deux demandes au même code ne se ressemblent pas.
fn empreinte_du_code(demande_id: Uuid, code: &str) -> String {
    empreinte(&format!("{demande_id}:{code}"))
}

/// L'adresse publique du site, pour écrire le lien de l'e-mail.
///
/// Elle vient de la requête, mais n'est acceptée que si elle est attendue :
/// sinon quelqu'un pourrait faire envoyer à un joueur un lien vers un autre site.
fn adresse_du_site(entetes: &HeaderMap) -> Result<String, Erreur> {
    let hote = hote(entetes).ok_or(Erreur::Refus("Adresse du site inattendue."))?;
    let attendu = std::env::var("SITE_HOST").ok();

    if est_local(hote) {
        Ok(format!("http://{hote}"))
    } else if hote.ends_with(".vercel.app") || attendu.as_deref() == Some(hote) {
        Ok(format!("https://{hote}"))
    } else {
        Err(Erreur::Refus("Adresse du site inattendue."))
    }
}

fn hote(entetes: &HeaderMap) -> Option<&str> {
    entetes
        .get("x-forwarded-host")
        .or_else(|| entetes.get(HOST))
        .and_then(|valeur| valeur.to_str().ok())
}

fn est_local(hote: &str) -> bool {
    hote.starts_with("localhost:") || hote.starts_with("127.0.0.1:")
}

fn cookie(jeton: &str, secondes: i64, entetes: &HeaderMap) -> String {
    // En local le site n'est pas en https : le navigateur refuserait un cookie « Secure ».
    let securise = if hote(entetes).is_some_and(est_local) { "" } else { "; Secure" };
    format!("{NOM_COOKIE}={jeton}; Path=/; HttpOnly; SameSite=Lax; Max-Age={secondes}{securise}")
}

fn lire_cookie(entetes: &HeaderMap) -> Option<String> {
    entetes
        .get_all(COOKIE)
        .iter()
        .filter_map(|valeur| valeur.to_str().ok())
        .flat_map(|valeur| valeur.split(';'))
        .find_map(|morceau| morceau.trim().strip_prefix(NOM_COOKIE)?.strip_prefix('='))
        .filter(|jeton| !jeton.is_empty())
        .map(str::to_owned)
}
