//! Copie une base dans un fichier, sans passer par le stockage Vercel Blob.
//!
//! ```bash
//! cargo run --bin sauvegarder -- <adresse de la base> <fichier.json.gz>
//! ```
//!
//! Le fichier a le même format que les copies quotidiennes : le programme `restaurer`
//! le lit de la même façon. Il sert aux essais, et à faire une copie à la main.

use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    let [_, adresse, fichier] = arguments.as_slice() else {
        eprintln!("usage : sauvegarder <adresse de la base> <fichier.json.gz>");
        std::process::exit(2);
    };

    let pool = match PgPoolOptions::new().max_connections(1).connect(adresse).await {
        Ok(pool) => pool,
        Err(erreur) => {
            eprintln!("connexion à la base impossible : {erreur}");
            std::process::exit(1);
        }
    };
    let copie = match epistolaire::sauvegarde::copie::copier(&pool).await {
        Ok(copie) => copie,
        Err(erreur) => {
            eprintln!("copie impossible : {erreur:?}");
            std::process::exit(1);
        }
    };
    if let Err(erreur) = std::fs::write(fichier, &copie.octets) {
        eprintln!("écriture de {fichier} impossible : {erreur}");
        std::process::exit(1);
    }
    println!("copie écrite dans {fichier} ({} octets)", copie.octets.len());
}
