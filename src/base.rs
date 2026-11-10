//! Connexion à la base PostgreSQL (Neon).
//!
//! Sur Vercel il n'y a pas de processus permanent : la connexion s'ouvre à la première
//! requête d'une instance, puis elle est réutilisée tant que l'instance vit.

use std::time::Duration;

use sqlx::postgres::{PgPool, PgPoolOptions};
use tokio::sync::OnceCell;

static POOL: OnceCell<PgPool> = OnceCell::const_new();

pub async fn pool() -> Result<&'static PgPool, sqlx::Error> {
    POOL.get_or_try_init(|| async {
        let url = std::env::var("DATABASE_URL")
            .map_err(|_| sqlx::Error::Configuration("DATABASE_URL manquant".into()))?;

        PgPoolOptions::new()
            // Peu de connexions : chaque instance en garde un petit nombre,
            // et Neon en limite le total.
            .max_connections(3)
            .acquire_timeout(Duration::from_secs(10))
            .connect(&url)
            .await
    })
    .await
}
