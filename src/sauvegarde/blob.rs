//! Le stockage Vercel Blob, en accès privé. Il garde les copies de la base, et les images
//! des documents et des sceaux ([`crate::images`]).
//!
//! Vercel ne fournit pas de bibliothèque Rust : ce fichier parle directement à son API,
//! comme le fait la bibliothèque officielle `@vercel/blob` (version 2.9, lue le 16 novembre) :
//!
//! * déposer : `PUT https://vercel.com/api/blob/?pathname=<chemin>` ;
//! * lister : `GET https://vercel.com/api/blob?prefix=<préfixe>&cursor=…` ;
//! * supprimer : `POST https://vercel.com/api/blob/delete`, avec `{ "urls": [ … ] }` ;
//! * lire un fichier privé : `GET <son url>`, avec le jeton.
//!
//! Chaque appel porte un jeton et l'identifiant du stockage. Deux façons de les obtenir,
//! comme dans la bibliothèque officielle (version 2.9, relue le 17 novembre) :
//!
//! * **OIDC**, sur Vercel : c'est ainsi que Vercel relie aujourd'hui un stockage à un projet.
//!   Le projet reçoit `BLOB_STORE_ID` ; le jeton, de courte durée, arrive avec chaque requête
//!   dans l'en-tête `x-vercel-oidc-token` (ou, à défaut, dans le fichier
//!   `VERCEL_OIDC_TOKEN_FILE` ou la variable `VERCEL_OIDC_TOKEN`). Le routeur le met de côté
//!   pour la durée de la requête ([`avec_jeton_oidc`]) ;
//! * **un jeton fixe**, `BLOB_READ_WRITE_TOKEN` (`vercel_blob_rw_<stockage>_<secret>`) : la
//!   façon d'avant, gardée pour les essais locaux et les outils en ligne de commande.
//!
//! Le jeton n'est jamais envoyé ailleurs qu'à Vercel : un fichier n'est lu que si son
//! adresse est celle d'un stockage Vercel. Pour les essais, `VERCEL_BLOB_API_URL` remplace
//! l'adresse de l'API par celle d'un faux stockage local ; il est alors seul accepté.

use std::future::Future;
use std::time::Duration;

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response as ReponseAxum;

use chrono::{DateTime, Utc};
use reqwest::{Client, RequestBuilder, Response};
use serde::{Deserialize, Serialize};

use crate::erreur::Erreur;

const API_PAR_DEFAUT: &str = "https://vercel.com/api/blob";
/// La version de l'API que parle la bibliothèque officielle lue.
const VERSION_API: &str = "13";

pub const REFUS_NON_CONFIGURE: Erreur = Erreur::Refus(
    "Le stockage des copies et des images n'est pas relié au site (ni BLOB_STORE_ID, ni BLOB_READ_WRITE_TOKEN).",
);

tokio::task_local! {
    /// Le jeton OIDC que Vercel a joint à la requête en cours, s'il y en a un.
    static JETON_OIDC: Option<String>;
}

/// Garde, pour la durée de la requête, le jeton OIDC que Vercel lui a joint. Branché sur
/// tout le routeur : la copie quotidienne, les sauvegardes du MJ et les images en ont besoin.
pub async fn avec_jeton_oidc(requete: Request, suite: Next) -> ReponseAxum {
    let jeton = requete
        .headers()
        .get("x-vercel-oidc-token")
        .and_then(|valeur| valeur.to_str().ok())
        .map(|valeur| valeur.trim().to_owned())
        .filter(|valeur| !valeur.is_empty());
    JETON_OIDC.scope(jeton, suite.run(requete)).await
}

/// Exécute un traitement avec un jeton OIDC donné : pour les programmes lancés hors d'une
/// requête, et pour les essais.
pub async fn avec_le_jeton<F: Future>(jeton: Option<String>, traitement: F) -> F::Output {
    JETON_OIDC.scope(jeton, traitement).await
}

/// Le jeton OIDC de la requête en cours, sinon celui du fichier ou de la variable que Vercel
/// fournit.
fn jeton_oidc() -> Option<String> {
    let non_vide = |jeton: String| Some(jeton.trim().to_owned()).filter(|jeton| !jeton.is_empty());
    JETON_OIDC
        .try_with(Clone::clone)
        .ok()
        .flatten()
        .or_else(|| {
            std::env::var("VERCEL_OIDC_TOKEN_FILE")
                .ok()
                .and_then(|fichier| std::fs::read_to_string(fichier).ok())
                .and_then(non_vide)
        })
        .or_else(|| std::env::var("VERCEL_OIDC_TOKEN").ok().and_then(non_vide))
}

/// Une variable d'environnement non vide.
fn variable(nom: &str) -> Option<String> {
    std::env::var(nom)
        .ok()
        .map(|valeur| valeur.trim().to_owned())
        .filter(|valeur| !valeur.is_empty())
}

pub struct Blob {
    jeton: String,
    stockage: String,
    api: String,
    /// Vrai quand l'API est un faux stockage d'essai.
    remplacee: bool,
    client: Client,
}

/// Un fichier du stockage.
#[derive(Debug, Deserialize, Serialize)]
pub struct Fichier {
    pub url: String,
    pub pathname: String,
    pub size: u64,
    #[serde(rename = "uploadedAt")]
    pub uploaded_at: DateTime<Utc>,
}

/// Ce que Vercel répond à un dépôt.
#[derive(Debug, Deserialize)]
pub struct Depot {
    /// L'adresse du fichier. Privée : elle ne se lit qu'avec le jeton.
    pub url: String,
    pub pathname: String,
}

#[derive(Deserialize)]
struct Page {
    blobs: Vec<Fichier>,
    cursor: Option<String>,
    #[serde(rename = "hasMore")]
    has_more: bool,
}

impl Blob {
    /// Le stockage relié au projet. Sans stockage relié : `None`.
    ///
    /// Comme la bibliothèque officielle : OIDC d'abord, quand le projet a `BLOB_STORE_ID` et
    /// qu'un jeton OIDC est là ; sinon le jeton fixe `BLOB_READ_WRITE_TOKEN`.
    pub fn depuis_l_environnement() -> Result<Option<Self>, Erreur> {
        let identifiants = match (variable("BLOB_STORE_ID"), jeton_oidc()) {
            (Some(stockage), Some(jeton)) => Some((
                jeton,
                stockage.strip_prefix("store_").unwrap_or(&stockage).to_owned(),
            )),
            _ => variable("BLOB_READ_WRITE_TOKEN").map(|jeton| {
                let stockage = jeton.split('_').nth(3).unwrap_or_default().to_owned();
                (jeton, stockage)
            }),
        };
        let Some((jeton, stockage)) = identifiants else {
            if variable("BLOB_STORE_ID").is_some() {
                // Le stockage est relié, mais Vercel n'a joint aucun jeton à cette requête.
                return Err(Erreur::interne(
                    "BLOB_STORE_ID est là, mais aucun jeton OIDC (en-tête x-vercel-oidc-token)",
                ));
            }
            return Ok(None);
        };
        if stockage.is_empty() {
            return Err(Erreur::interne("BLOB_READ_WRITE_TOKEN n'a pas la forme attendue"));
        }
        let remplacement = std::env::var("VERCEL_BLOB_API_URL")
            .ok()
            .filter(|adresse| !adresse.trim().is_empty());
        let client = Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(Erreur::interne)?;
        Ok(Some(Self {
            jeton,
            stockage,
            remplacee: remplacement.is_some(),
            api: remplacement
                .unwrap_or_else(|| API_PAR_DEFAUT.to_owned())
                .trim_end_matches('/')
                .to_owned(),
            client,
        }))
    }

    fn appel(&self, requete: RequestBuilder) -> RequestBuilder {
        requete
            .bearer_auth(&self.jeton)
            .header("x-api-version", VERSION_API)
            .header("x-vercel-blob-store-id", &self.stockage)
    }

    /// Dépose un fichier privé, et rend son adresse. Un fichier du même nom n'est jamais écrasé.
    pub async fn deposer(
        &self,
        chemin: &str,
        octets: Vec<u8>,
        type_contenu: &str,
    ) -> Result<Depot, Erreur> {
        let reponse = self
            .appel(self.client.put(format!("{}/", self.api)))
            .query(&[("pathname", chemin)])
            .header("x-vercel-blob-access", "private")
            .header("x-add-random-suffix", "0")
            .header("x-allow-overwrite", "0")
            .header("x-content-type", type_contenu)
            .body(octets)
            .send()
            .await
            .map_err(Erreur::interne)?;
        verifier(reponse, "dépôt")
            .await?
            .json()
            .await
            .map_err(Erreur::interne)
    }

    /// Tous les fichiers dont le nom commence par ce préfixe.
    pub async fn lister(&self, prefixe: &str) -> Result<Vec<Fichier>, Erreur> {
        let mut fichiers = Vec::new();
        let mut curseur: Option<String> = None;
        loop {
            let mut parametres = vec![("prefix", prefixe.to_owned()), ("limit", "1000".to_owned())];
            if let Some(curseur) = &curseur {
                parametres.push(("cursor", curseur.clone()));
            }
            let reponse = self
                .appel(self.client.get(&self.api))
                .query(&parametres)
                .send()
                .await
                .map_err(Erreur::interne)?;
            let page: Page = verifier(reponse, "liste")
                .await?
                .json()
                .await
                .map_err(Erreur::interne)?;
            fichiers.extend(page.blobs);
            match page.cursor {
                Some(suivant) if page.has_more => curseur = Some(suivant),
                _ => break,
            }
        }
        Ok(fichiers)
    }

    /// Supprime des fichiers, désignés par leur adresse.
    pub async fn supprimer(&self, urls: &[String]) -> Result<(), Erreur> {
        for paquet in urls.chunks(500) {
            let reponse = self
                .appel(self.client.post(format!("{}/delete", self.api)))
                .json(&serde_json::json!({ "urls": paquet }))
                .send()
                .await
                .map_err(Erreur::interne)?;
            verifier(reponse, "suppression").await?;
        }
        Ok(())
    }

    /// Lit un fichier privé.
    pub async fn lire(&self, url: &str) -> Result<Vec<u8>, Erreur> {
        if !self.adresse_sure(url) {
            return Err(Erreur::interne(format!("adresse de fichier inattendue : {url}")));
        }
        let reponse = self
            .client
            .get(url)
            .bearer_auth(&self.jeton)
            .send()
            .await
            .map_err(Erreur::interne)?;
        let octets = verifier(reponse, "lecture")
            .await?
            .bytes()
            .await
            .map_err(Erreur::interne)?;
        Ok(octets.to_vec())
    }

    /// Le jeton ne part que vers un stockage Vercel, ou vers le faux stockage des essais.
    fn adresse_sure(&self, url: &str) -> bool {
        if self.remplacee {
            return url.starts_with(&format!("{}/", self.api));
        }
        let Some(reste) = url.strip_prefix("https://") else {
            return false;
        };
        let hote = reste.split('/').next().unwrap_or_default();
        hote.ends_with(".blob.vercel-storage.com")
    }
}

/// Une réponse en erreur devient une erreur interne, avec ce que Vercel en dit.
async fn verifier(reponse: Response, geste: &str) -> Result<Response, Erreur> {
    if reponse.status().is_success() {
        return Ok(reponse);
    }
    let statut = reponse.status();
    let detail: String = reponse.text().await.unwrap_or_default().chars().take(300).collect();
    Err(Erreur::interne(format!("Vercel Blob, {geste} : {statut} {detail}")))
}
