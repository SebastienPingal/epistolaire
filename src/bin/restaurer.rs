//! Restaure une copie de la base dans une base neuve.
//!
//! ```bash
//! cargo run --bin restaurer -- <fichier.json.gz> <adresse de la base>
//! ```
//!
//! La base visée doit être vide, ou du moins sans aucun pli : le programme refuse de
//! restaurer par-dessus du courrier. Les garde-fous sont décrits dans
//! `src/sauvegarde/restauration.rs`, et le pas à pas dans `docs/FONCTIONNEMENT.md`.
//!
//! Jamais vers la base du site en ligne sans l'accord explicite du MJ.

#[tokio::main]
async fn main() {
    let arguments: Vec<String> = std::env::args().collect();
    let [_, fichier, adresse] = arguments.as_slice() else {
        eprintln!("usage : restaurer <fichier.json.gz> <adresse de la base>");
        std::process::exit(2);
    };

    let octets = match std::fs::read(fichier) {
        Ok(octets) => octets,
        Err(erreur) => {
            eprintln!("lecture de {fichier} impossible : {erreur}");
            std::process::exit(1);
        }
    };
    let copie = match epistolaire::sauvegarde::copie::decompresser(&octets) {
        Ok(copie) => copie,
        Err(erreur) => {
            eprintln!("{erreur}");
            std::process::exit(1);
        }
    };
    println!(
        "copie du {} (structure {}), {} tables",
        copie.faite_le,
        copie.structure,
        copie.tables.len()
    );

    match epistolaire::sauvegarde::restauration::restaurer(&copie, adresse).await {
        Ok(bilan) => {
            for (table, lignes) in &bilan.lignes {
                println!("  {table} : {lignes}");
            }
            println!("restauration terminée (structure {})", bilan.structure);
        }
        Err(erreur) => {
            eprintln!("restauration refusée ou interrompue, aucune donnée n'a été chargée : {erreur}");
            std::process::exit(1);
        }
    }
}
