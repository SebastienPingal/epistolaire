//! Serveur local : le même routeur que sur Vercel, servi directement.
//! L'interface (Vite) lui transmet les requêtes `/api`.

use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // Lit le fichier `.env` s'il existe (DATABASE_URL, etc.).
    let _ = dotenvy::dotenv();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8787);
    let adresse = SocketAddr::from(([127, 0, 0, 1], port));

    let ecoute = tokio::net::TcpListener::bind(adresse)
        .await
        .expect("impossible d'ouvrir le port local");
    println!("Serveur local : http://{adresse}");

    axum::serve(ecoute, epistolaire::routeur())
        .await
        .expect("le serveur local s'est arrêté");
}
