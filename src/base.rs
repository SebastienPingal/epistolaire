//! Connexion à la base PostgreSQL (Neon) et mise à jour de sa structure.
//!
//! Sur Vercel il n'y a pas de processus permanent : la connexion s'ouvre à la première
//! requête d'une instance, puis elle est réutilisée tant que l'instance vit.

use std::time::Duration;

use sqlx::migrate::Migrator;
use sqlx::postgres::{PgPool, PgPoolOptions};
use tokio::sync::OnceCell;

/// Les migrations du dossier `migrations/`, embarquées dans le programme.
static MIGRATIONS: Migrator = sqlx::migrate!();

static POOL: OnceCell<PgPool> = OnceCell::const_new();

/// La connexion partagée. Au premier appel, la structure de la base est mise à jour
/// si le programme connaît une migration que la base n'a pas encore reçue.
pub async fn pool() -> Result<&'static PgPool, sqlx::Error> {
    POOL.get_or_try_init(|| async {
        let pool = connecter().await?;
        migrer_si_besoin(&pool).await?;
        Ok(pool)
    })
    .await
}

/// Le numéro de la dernière migration appliquée à la base.
pub async fn version_structure() -> Result<Option<i64>, sqlx::Error> {
    Ok(version_appliquee(pool().await?).await)
}

async fn connecter() -> Result<PgPool, sqlx::Error> {
    let url = variable("DATABASE_URL")?;

    PgPoolOptions::new()
        // Peu de connexions : chaque instance en garde un petit nombre,
        // et Neon en limite le total.
        .max_connections(3)
        .acquire_timeout(Duration::from_secs(10))
        .connect(&url)
        .await
}

async fn migrer_si_besoin(pool: &PgPool) -> Result<(), sqlx::Error> {
    let attendue = MIGRATIONS.iter().map(|migration| migration.version).max();

    // Cas courant : la base est à jour (ou en avance sur ce programme, pendant
    // qu'une version plus récente du site est en aperçu). Rien à faire.
    if version_appliquee(pool).await >= attendue {
        return Ok(());
    }

    // Une migration se fait sur une connexion directe : le verrou qui empêche deux
    // instances de migrer en même temps ne traverse pas le répartiteur de connexions de Neon.
    let url = variable("DATABASE_URL_UNPOOLED").or_else(|_| variable("DATABASE_URL"))?;
    let directe = PgPoolOptions::new().max_connections(1).connect(&url).await?;
    MIGRATIONS.run(&directe).await?;
    directe.close().await;
    Ok(())
}

async fn version_appliquee(pool: &PgPool) -> Option<i64> {
    // La table n'existe pas tant qu'aucune migration n'a tourné : l'erreur vaut « aucune ».
    sqlx::query_scalar::<_, Option<i64>>("select max(version) from _sqlx_migrations where success")
        .fetch_one(pool)
        .await
        .ok()
        .flatten()
}

fn variable(nom: &str) -> Result<String, sqlx::Error> {
    std::env::var(nom).map_err(|_| sqlx::Error::Configuration(format!("{nom} manquant").into()))
}
