//! Les tests de confidentialité : un joueur ne reçoit jamais ce qu'il ne doit pas voir.
//!
//! Deux sortes de tests :
//!
//! * **sans base**, toujours lancés par `cargo test` : l'inventaire des routes (une route
//!   ajoutée sans être ajoutée ici fait échouer les tests), et la règle du code (la porte
//!   des joueurs ne lit jamais les tables `plis` et `exemplaires`) ;
//! * **avec base**, lancés par `essais/confidentialite.sh` : une base d'essai à part
//!   (`EPISTOLAIRE_TESTS_BASE`, dont le nom finit par `_tests`) est vidée, remplie du jeu de
//!   `tests/donnees/confidentialite.sql`, puis chaque route est appelée pour Alix et
//!   Bertrand. Sans cette variable, ce test s'annonce ignoré et réussit : `cargo test` sert
//!   aussi à générer les types de l'interface.
//!
//! Ce qui est vérifié : aucune réponse ne contient un marqueur interdit, une adresse e-mail,
//! l'identifiant d'un personnage caché, d'un pli ou d'un exemplaire qui n'est pas à elle,
//! ni une date réelle (sauf la date de ses propres brouillons) ; les gestes interdits
//! répondent 404 et ne changent rien en base ; la porte du MJ répond 403 à un joueur et
//! 401 sans session ; la porte des tâches répond 401 sans le secret.
//!
//! Les étapes 10 à 14 ajouteront leurs cas : chaque nouvelle route de joueur s'ajoute à
//! [`ROUTES_JOUEUR`] et s'essaie dans [`derouler`].

use std::collections::BTreeSet;

use axum::body::{Body, to_bytes};
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tower::ServiceExt;

// ---------------------------------------------------------------------------
// Les routes vérifiées
// ---------------------------------------------------------------------------

/// Chaque route des joueurs, telle que déclarée dans `src/acces/joueur/mod.rs`.
/// Chacune doit être essayée par le test avec base.
const ROUTES_JOUEUR: &[&str] = &[
    "GET /api/joueur/ecritoire",
    "POST /api/joueur/brouillons",
    "GET /api/joueur/brouillons/{id}",
    "PUT /api/joueur/brouillons/{id}",
    "DELETE /api/joueur/brouillons/{id}",
    "POST /api/joueur/brouillons/{id}/envoi",
    "GET /api/joueur/reception",
    "GET /api/joueur/plis/{id}",
    "DELETE /api/joueur/plis/{id}",
    "POST /api/joueur/plis/{id}/ouverture",
    "PUT /api/joueur/plis/{id}/dossier",
    "PUT /api/joueur/rangement",
    "POST /api/joueur/destruction",
    "POST /api/joueur/dossiers",
    "GET /api/joueur/dossiers/{id}",
    "PUT /api/joueur/dossiers/{id}",
    "DELETE /api/joueur/dossiers/{id}",
    "GET /api/joueur/fiche",
    "GET /api/joueur/pastille",
    "GET /api/joueur/notifications",
    "PUT /api/joueur/notifications",
    "POST /api/joueur/abonnements",
    "DELETE /api/joueur/abonnements",
];

/// Les routes hors des trois portes, déclarées dans `src/lib.rs`.
const ROUTES_PUBLIQUES: &[&str] = &[
    "GET /api/sante",
    "POST /api/connexion/demande",
    "POST /api/connexion/code",
    "POST /api/connexion/lien",
    "POST /api/deconnexion",
    "GET /api/moi",
    "GET /api/notifications/cle",
];

/// Les routes déclarées dans un fichier source : `MÉTHODE préfixe/chemin`.
fn routes_declarees(fichier: &str, prefixe: &str) -> BTreeSet<String> {
    let source = std::fs::read_to_string(fichier).expect("fichier de routes illisible");
    let mut routes = BTreeSet::new();
    let mut reste = source.as_str();
    while let Some(debut) = reste.find(".route(") {
        let apres = &reste[debut + ".route(".len()..];
        let mut profondeur = 1;
        let mut fin = apres.len();
        for (i, c) in apres.char_indices() {
            match c {
                '(' => profondeur += 1,
                ')' => {
                    profondeur -= 1;
                    if profondeur == 0 {
                        fin = i;
                        break;
                    }
                }
                _ => {}
            }
        }
        let appel = &apres[..fin];
        let chemin = appel.split('"').nth(1).expect("une route sans chemin");
        let mut methodes = 0;
        for methode in ["get", "post", "put", "delete", "patch"] {
            if appelle(appel, methode) {
                routes.insert(format!("{} {prefixe}{chemin}", methode.to_uppercase()));
                methodes += 1;
            }
        }
        assert!(methodes > 0, "{fichier} : la route {chemin} n'a aucune méthode reconnue");
        reste = &apres[fin..];
    }
    routes
}

/// Le texte contient-il un appel à `nom(…)`, et pas à `quelque_chose_nom(…)` ?
fn appelle(texte: &str, nom: &str) -> bool {
    let motif = format!("{nom}(");
    texte.match_indices(&motif).any(|(i, _)| {
        texte[..i]
            .chars()
            .next_back()
            .is_none_or(|c| !(c.is_alphanumeric() || c == '_' || c == ':'))
    })
}

#[test]
fn inventaire_des_routes_des_joueurs() {
    let declarees = routes_declarees("src/acces/joueur/mod.rs", "/api/joueur");
    let verifiees: BTreeSet<String> = ROUTES_JOUEUR.iter().map(|r| (*r).to_owned()).collect();
    let sans_test: Vec<_> = declarees.difference(&verifiees).collect();
    let disparues: Vec<_> = verifiees.difference(&declarees).collect();
    assert!(
        sans_test.is_empty(),
        "routes de joueur sans test de confidentialité : {sans_test:?}. \
         Ajoutez-les à ROUTES_JOUEUR et essayez-les dans tests/confidentialite.rs"
    );
    assert!(disparues.is_empty(), "routes vérifiées qui n'existent plus : {disparues:?}");
}

#[test]
fn inventaire_des_routes_publiques() {
    let declarees = routes_declarees("src/lib.rs", "/api");
    let verifiees: BTreeSet<String> = ROUTES_PUBLIQUES.iter().map(|r| (*r).to_owned()).collect();
    assert_eq!(
        declarees, verifiees,
        "les routes hors des portes ont changé : mettez à jour ROUTES_PUBLIQUES et leurs essais"
    );
}

#[test]
fn inventaire_des_portes_du_mj_et_des_taches() {
    // Ces routes sont toutes essayées automatiquement : on vérifie seulement que la
    // lecture du fichier les trouve.
    let mj = routes_declarees("src/acces/mj/mod.rs", "/api/mj");
    assert!(mj.contains("GET /api/mj/a-traiter") && mj.len() > 20, "{mj:?}");
    let taches = routes_declarees("src/taches/mod.rs", "/api/taches");
    assert!(taches.contains("GET /api/taches/notifications"), "{taches:?}");
    assert!(taches.contains("GET /api/taches/sauvegarde"), "{taches:?}");
}

/// La règle du code : la porte des joueurs ne lit ni n'écrit les tables `plis` et
/// `exemplaires`, sauf deux requêtes de `ecritoire.rs` (le compte du quota, et l'envoi).
#[test]
fn la_porte_des_joueurs_ne_lit_pas_les_tables_du_courrier() {
    let permises: &[(&str, &str)] = &[
        ("ecritoire.rs", "from plis l"),
        ("ecritoire.rs", "update plis"),
    ];
    let mut trouvees_permises = Vec::new();
    let mut fautes = Vec::new();

    let mut fichiers: Vec<_> = std::fs::read_dir("src/acces/joueur")
        .expect("dossier de la porte des joueurs illisible")
        .map(|entree| entree.expect("entrée illisible").path())
        .collect();
    fichiers.sort();
    for chemin in fichiers {
        let nom = chemin.file_name().unwrap_or_default().to_string_lossy().into_owned();
        let source = std::fs::read_to_string(&chemin).expect("fichier illisible");
        for (numero, ligne) in source.lines().enumerate() {
            let ligne = ligne.trim().to_lowercase();
            if ligne.starts_with("//") {
                continue;
            }
            for mot in ["from", "join", "update", "into"] {
                for table in ["plis", "exemplaires"] {
                    let motif = format!("{mot} {table}");
                    let touche = ligne.match_indices(&motif).any(|(i, _)| {
                        ligne[i + motif.len()..]
                            .chars()
                            .next()
                            .is_none_or(|c| !(c.is_alphanumeric() || c == '_'))
                    });
                    if !touche {
                        continue;
                    }
                    if permises.contains(&(nom.as_str(), ligne.as_str())) {
                        trouvees_permises.push((nom.clone(), ligne.clone()));
                    } else {
                        fautes.push(format!("{nom}:{} : {ligne}", numero + 1));
                    }
                }
            }
        }
    }
    assert!(
        fautes.is_empty(),
        "la porte des joueurs touche les tables du courrier : {fautes:#?}. \
         Passer par les vues plis_recus et brouillons, ou les fonctions ouvrir_pli, ranger_pli, detruire_pli"
    );
    assert_eq!(
        trouvees_permises.len(),
        permises.len(),
        "les deux exceptions de ecritoire.rs ont changé : {trouvees_permises:?}"
    );
}

// ---------------------------------------------------------------------------
// Le jeu de données
// ---------------------------------------------------------------------------

const ALIX: &str = "jeton-alix";
const BERTRAND: &str = "jeton-bertrand";
const MJ: &str = "jeton-mj";
const SECRET: &str = "secret-des-tests";

/// L'identifiant fixe d'une ligne du jeu de données : `id("a1")`.
fn id(suffixe: &str) -> String {
    format!("00000000-0000-0000-0000-0000000000{suffixe}")
}

/// Tous les identifiants du jeu de données, les siens et ceux des autres.
fn tous_les_identifiants() -> Vec<String> {
    [
        "b0", "b1", "b2", "a1", "a2", "a3", "a4", "a5", "c1", "c2", "c3", "f1", "f2", "d1", "d2",
        "d3", "d4", "d5", "d6", "d7", "d8", "d9", "da", "db", "e1", "e2", "e3", "e4", "e5", "e6",
        "e7", "e8", "ef", "99",
    ]
    .iter()
    .map(|s| id(s))
    .collect()
}

/// Ce qu'Alix ne doit jamais recevoir.
const MARQUEURS_POUR_ALIX: &[&str] = &[
    "BROUILLON-BERTRAND",
    "ORIGINAL-FILE",
    "ADRESSE-LIBRE",
    "EN-ROUTE",
    "RETENU",
    "PERDU",
    "FERME",
    "ORIGINAL-SECRET",
    "ORIGINAL-REDIRIGE",
    "DETRUIT",
    "BERTRAND-",
    "NOTES-MJ",
    "INFO-SECRETE",
    "EVENEMENT-SECRET",
    "POLICE-FAUSSAIRE",
    "AUTEUR-CACHE",
    "CLEMENCE-VISEE",
    "@",
];

/// Les identifiants qu'Alix ne doit jamais recevoir : les comptes, les personnages cachés,
/// les plis (elle ne voit que des exemplaires, et son brouillon), les exemplaires qui ne
/// sont pas arrivés chez elle, ce qui est à Bertrand, l'écriture du faussaire, le sceau
/// qu'elle ne détient pas, l'information du MJ.
fn identifiants_interdits_a_alix() -> Vec<String> {
    [
        "b0", "b1", "b2", "a3", "a4", "c2", "c3", "f2", "d2", "d3", "d4", "d5", "d6", "d7", "d8",
        "d9", "da", "db", "e1", "e2", "e3", "e7", "e8", "ef", "99",
    ]
    .iter()
    .map(|s| id(s))
    .collect()
}

const MARQUEURS_POUR_BERTRAND: &[&str] = &[
    "BROUILLON-ALIX",
    "ORIGINAL-",
    "ADRESSE-LIBRE",
    "EN-ROUTE",
    "RETENU",
    "PERDU",
    "FERME",
    "DETRUIT",
    "Version livrée",
    "Archives",
    "NOTES-MJ",
    "INFO-SECRETE",
    "EVENEMENT-SECRET",
    "POLICE-FAUSSAIRE",
    "AUTEUR-CACHE",
    "CLEMENCE-VISEE",
    "@",
];

// ---------------------------------------------------------------------------
// L'outillage
// ---------------------------------------------------------------------------

struct Essai {
    /// Une connexion à la base d'essai, à part de celle du site, pour regarder la base.
    base: PgPool,
    echecs: Vec<String>,
    essayees: BTreeSet<String>,
}

struct Reponse {
    statut: StatusCode,
    texte: String,
}

impl Reponse {
    fn json(&self) -> Value {
        serde_json::from_str(&self.texte).unwrap_or(Value::Null)
    }
}

impl Essai {
    /// Appelle le site. `route` est le motif déclaré (`GET /api/joueur/plis/{id}`), et
    /// `parametres` remplacent ses `{…}` dans l'ordre.
    async fn appel(
        &mut self,
        route: &str,
        parametres: &[&str],
        jeton: Option<&str>,
        autorisation: Option<&str>,
        corps: Option<Value>,
    ) -> Reponse {
        self.essayees.insert(route.to_owned());
        let (methode, motif) = route.split_once(' ').expect("route sans méthode");
        let mut chemin = String::new();
        let mut parametres = parametres.iter();
        let mut reste = motif;
        while let Some(debut) = reste.find('{') {
            let fin = reste[debut..].find('}').expect("motif mal fermé") + debut;
            chemin.push_str(&reste[..debut]);
            chemin.push_str(parametres.next().expect("paramètre manquant"));
            reste = &reste[fin + 1..];
        }
        chemin.push_str(reste);

        let mut requete = Request::builder()
            .method(methode)
            .uri(&chemin)
            .header("host", "localhost:8787");
        if let Some(jeton) = jeton {
            requete = requete.header("cookie", format!("session={jeton}"));
        }
        if let Some(autorisation) = autorisation {
            requete = requete.header("authorization", autorisation);
        }
        let requete = match corps {
            Some(corps) => requete
                .header("content-type", "application/json")
                .body(Body::from(corps.to_string())),
            None => requete.body(Body::empty()),
        }
        .expect("requête mal formée");

        let reponse = epistolaire::routeur()
            .oneshot(requete)
            .await
            .expect("le routeur ne répond pas");
        let statut = reponse.status();
        let octets = to_bytes(reponse.into_body(), usize::MAX)
            .await
            .expect("réponse illisible");
        Reponse {
            statut,
            texte: String::from_utf8_lossy(&octets).into_owned(),
        }
    }

    async fn alix(&mut self, route: &str, parametres: &[&str], corps: Option<Value>) -> Reponse {
        self.appel(route, parametres, Some(ALIX), None, corps).await
    }

    async fn bertrand(&mut self, route: &str, parametres: &[&str], corps: Option<Value>) -> Reponse {
        self.appel(route, parametres, Some(BERTRAND), None, corps).await
    }

    fn echec(&mut self, message: String) {
        eprintln!("ÉCHEC {message}");
        self.echecs.push(message);
    }

    fn statut(&mut self, contexte: &str, reponse: &Reponse, attendu: StatusCode) {
        if reponse.statut != attendu {
            self.echec(format!(
                "{contexte} : statut {} au lieu de {attendu} ({})",
                reponse.statut,
                reponse.texte.chars().take(200).collect::<String>()
            ));
        }
    }

    fn vrai(&mut self, contexte: &str, condition: bool) {
        if !condition {
            self.echec(contexte.to_owned());
        }
    }

    /// Ce qu'Alix reçoit : ni marqueur, ni identifiant interdit, ni date réelle.
    fn examiner_pour_alix(&mut self, contexte: &str, texte: &str, permis: &[&str]) {
        for marqueur in MARQUEURS_POUR_ALIX {
            if !permis.contains(marqueur) && texte.contains(marqueur) {
                self.echec(format!("{contexte} : Alix reçoit « {marqueur} »"));
            }
        }
        for interdit in identifiants_interdits_a_alix() {
            if texte.contains(&interdit) {
                self.echec(format!("{contexte} : Alix reçoit l'identifiant {interdit}"));
            }
        }
        if let Some(date) = date_reelle(texte) {
            self.echec(format!("{contexte} : Alix reçoit une date réelle ({date})"));
        }
    }

    fn examiner_pour_bertrand(&mut self, contexte: &str, texte: &str) {
        for marqueur in MARQUEURS_POUR_BERTRAND {
            if texte.contains(marqueur) {
                self.echec(format!("{contexte} : Bertrand reçoit « {marqueur} »"));
            }
        }
        for interdit in ["a3", "a4", "b0", "b1", "b2", "e4", "e5", "e6", "f1", "c1", "c2"] {
            if texte.contains(&id(interdit)) {
                self.echec(format!("{contexte} : Bertrand reçoit l'identifiant {}", id(interdit)));
            }
        }
        if let Some(date) = date_reelle(texte) {
            self.echec(format!("{contexte} : Bertrand reçoit une date réelle ({date})"));
        }
    }

    /// Une empreinte de tout le contenu de la base, pour vérifier qu'un geste n'a rien changé.
    async fn empreinte_de_la_base(&self) -> String {
        let tables: Vec<String> = sqlx::query_scalar(
            "select table_name::text from information_schema.tables
             where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
        )
        .fetch_all(&self.base)
        .await
        .expect("liste des tables");
        let mut empreinte = String::new();
        for table in tables {
            let partie: String = sqlx::query_scalar(&format!(
                "select coalesce(md5(string_agg(t::text, '|' order by t::text)), '') from \"{table}\" t"
            ))
            .fetch_one(&self.base)
            .await
            .expect("empreinte d'une table");
            empreinte.push_str(&format!("{table}:{partie};"));
        }
        empreinte
    }

    async fn sql_vrai(&mut self, contexte: &str, requete: &str) {
        let vrai: bool = sqlx::query_scalar(requete)
            .fetch_one(&self.base)
            .await
            .expect("requête de vérification");
        self.vrai(contexte, vrai);
    }
}

/// Une date réelle (`AAAA-MM-JJ`) dans un texte : le premier exemple trouvé.
fn date_reelle(texte: &str) -> Option<String> {
    let octets = texte.as_bytes();
    let forme = b"dddd-dd-dd";
    octets.windows(forme.len()).find_map(|fenetre| {
        let ressemble = fenetre.iter().zip(forme).all(|(c, f)| match f {
            b'd' => c.is_ascii_digit(),
            _ => c == f,
        });
        ressemble.then(|| String::from_utf8_lossy(fenetre).into_owned())
    })
}

/// L'écritoire, sans la date de modification de ses propres brouillons : seule date
/// réelle qu'un joueur ait le droit de voir.
fn sans_dates_de_brouillon(mut ecritoire: Value) -> String {
    if let Some(brouillons) = ecritoire["brouillons"].as_array_mut() {
        for brouillon in brouillons {
            if let Some(champs) = brouillon.as_object_mut() {
                champs.remove("modifie_le");
            }
        }
    }
    ecritoire.to_string()
}

fn ids_de(liste: &Value) -> BTreeSet<String> {
    liste
        .as_array()
        .map(|elements| {
            elements
                .iter()
                .filter_map(|element| element["id"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

fn ensemble(suffixes: &[&str]) -> BTreeSet<String> {
    suffixes.iter().map(|s| id(s)).collect()
}

// ---------------------------------------------------------------------------
// Le test avec base
// ---------------------------------------------------------------------------

#[test]
fn confidentialite() {
    let Ok(adresse) = std::env::var("EPISTOLAIRE_TESTS_BASE") else {
        eprintln!(
            "tests de confidentialité avec base : ignorés (EPISTOLAIRE_TESTS_BASE n'est pas défini ; \
             lancez essais/confidentialite.sh)"
        );
        return;
    };
    let nom = adresse.rsplit('/').next().unwrap_or_default();
    let nom = nom.split('?').next().unwrap_or_default();
    assert!(
        nom.ends_with("_tests"),
        "EPISTOLAIRE_TESTS_BASE doit désigner une base d'essai dont le nom finit par _tests \
         (elle est entièrement vidée) : {nom}"
    );

    // Le site lit sa base dans DATABASE_URL au premier appel : on la pose avant.
    // SAFETY : aucun autre fil ne tourne encore dans ce test.
    unsafe {
        std::env::set_var("DATABASE_URL", &adresse);
        std::env::set_var("DATABASE_URL_UNPOOLED", &adresse);
        std::env::set_var("CRON_SECRET", SECRET);
        std::env::remove_var("VERCEL_ENV");
        std::env::remove_var("SMTP_HOST");
        std::env::remove_var("BLOB_READ_WRITE_TOKEN");
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("moteur asynchrone")
        .block_on(async {
            let base = PgPoolOptions::new()
                .max_connections(2)
                .connect(&adresse)
                .await
                .expect("base d'essai injoignable");
            sqlx::raw_sql("drop schema public cascade; create schema public;")
                .execute(&base)
                .await
                .expect("vidage de la base d'essai");
            epistolaire::base::pool().await.expect("migrations de la base d'essai");
            sqlx::raw_sql(include_str!("donnees/confidentialite.sql"))
                .execute(&base)
                .await
                .expect("chargement du jeu de données");

            let mut essai = Essai {
                base,
                echecs: Vec::new(),
                essayees: BTreeSet::new(),
            };
            derouler(&mut essai).await;

            for route in ROUTES_JOUEUR.iter().chain(ROUTES_PUBLIQUES) {
                if !essai.essayees.contains(*route) {
                    essai.echec(format!("route jamais essayée : {route}"));
                }
            }
            println!("{} routes essayées", essai.essayees.len());
            assert!(
                essai.echecs.is_empty(),
                "{} vérifications ont échoué :\n{}",
                essai.echecs.len(),
                essai.echecs.join("\n")
            );
        });
}

async fn derouler(essai: &mut Essai) {
    lectures_d_alix(essai).await;

    let avant = essai.empreinte_de_la_base().await;
    gestes_interdits_a_alix(essai).await;
    porte_du_mj(essai).await;
    porte_des_taches(essai).await;
    let apres = essai.empreinte_de_la_base().await;
    essai.vrai(
        "les gestes interdits ont changé quelque chose dans la base",
        avant == apres,
    );

    gestes_permis_a_alix(essai).await;
    lectures_de_bertrand(essai).await;
    routes_publiques(essai).await;
}

/// Toutes les lectures d'Alix, avec tous les identifiants du jeu de données.
async fn lectures_d_alix(essai: &mut Essai) {
    let r = essai.alix("GET /api/joueur/ecritoire", &[], None).await;
    essai.statut("écritoire", &r, StatusCode::OK);
    let ecritoire = r.json();
    essai.examiner_pour_alix("écritoire", &sans_dates_de_brouillon(ecritoire.clone()), &[]);
    let brouillons = ids_de(&ecritoire["brouillons"]);
    essai.vrai("écritoire : seul son brouillon", brouillons == ensemble(&["d1"]));
    let carnet: BTreeSet<String> = ecritoire["carnet"]
        .as_array()
        .map(|contacts| {
            contacts
                .iter()
                .filter_map(|contact| contact["nom"].as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    essai.vrai(
        "écritoire : le carnet d'Alix, et lui seul",
        carnet == ["Bertrand".to_owned(), "Damien".to_owned()].into(),
    );
    essai.vrai(
        "écritoire : seulement les sceaux qu'elle détient",
        ids_de(&ecritoire["sceaux"]) == ensemble(&["c1"]),
    );

    let r = essai.alix("GET /api/joueur/reception", &[], None).await;
    essai.statut("réception", &r, StatusCode::OK);
    essai.examiner_pour_alix("réception", &r.texte, &[]);
    let reception = r.json();
    essai.vrai(
        "réception : les plis arrivés, non rangés, non détruits",
        ids_de(&reception["plis"]) == ensemble(&["e4", "e6"]),
    );
    essai.vrai(
        "réception : ses seuls dossiers",
        ids_de(&reception["dossiers"]) == ensemble(&["f1"]),
    );
    essai.vrai("réception : deux plis non ouverts", reception["non_ouverts"] == 2);

    let r = essai.alix("GET /api/joueur/fiche", &[], None).await;
    essai.statut("fiche", &r, StatusCode::OK);
    essai.examiner_pour_alix("fiche", &r.texte, &[]);
    essai.vrai("fiche : la sienne", r.json()["role"] == "Archiviste");

    let r = essai.alix("GET /api/joueur/pastille", &[], None).await;
    essai.statut("pastille", &r, StatusCode::OK);
    essai.vrai("pastille : deux plis non ouverts", r.json()["nombre"] == 2);

    let r = essai.alix("GET /api/joueur/notifications", &[], None).await;
    essai.statut("notifications", &r, StatusCode::OK);
    essai.examiner_pour_alix("notifications", &r.texte, &[]);
    essai.vrai("notifications : l'abonnement de Bertrand ne compte pas", r.json()["navigateurs_abonnes"] == 0);

    let r = essai.alix("GET /api/moi", &[], None).await;
    essai.statut("moi", &r, StatusCode::OK);
    essai.examiner_pour_alix("moi", &r.texte, &[]);

    let r = essai.alix("GET /api/notifications/cle", &[], None).await;
    essai.examiner_pour_alix("clé des notifications", &r.texte, &[]);

    for cible in tous_les_identifiants() {
        let r = essai.alix("GET /api/joueur/brouillons/{id}", &[&cible], None).await;
        let attendu = if cible == id("d1") { StatusCode::OK } else { StatusCode::NOT_FOUND };
        essai.statut(&format!("brouillon {cible}"), &r, attendu);
        essai.examiner_pour_alix(&format!("brouillon {cible}"), &r.texte, &[]);

        let r = essai.alix("GET /api/joueur/plis/{id}", &[&cible], None).await;
        let arrive = [id("e4"), id("e5"), id("e6")].contains(&cible);
        let attendu = if arrive { StatusCode::OK } else { StatusCode::NOT_FOUND };
        essai.statut(&format!("pli {cible}"), &r, attendu);
        essai.examiner_pour_alix(&format!("pli {cible}"), &r.texte, &[]);

        let r = essai.alix("GET /api/joueur/dossiers/{id}", &[&cible], None).await;
        let attendu = if cible == id("f1") { StatusCode::OK } else { StatusCode::NOT_FOUND };
        essai.statut(&format!("dossier {cible}"), &r, attendu);
        essai.examiner_pour_alix(&format!("dossier {cible}"), &r.texte, &[]);
    }

    // Fermé : rien que l'extérieur.
    let ferme = essai.alix("GET /api/joueur/plis/{id}", &[&id("e4")], None).await.json();
    essai.vrai("pli fermé : pas de contenu", ferme["contenu"].is_null());
    essai.vrai("pli fermé : pas de début", ferme["exterieur"]["debut"].is_null());
    essai.vrai(
        "pli fermé : le sceau, avec son nom gravé",
        ferme["exterieur"]["sceau"]["nom"] == "Damien",
    );
    let redirige = essai.alix("GET /api/joueur/plis/{id}", &[&id("e6")], None).await.json();
    essai.vrai("pli redirigé fermé : pas de contenu", redirige["contenu"].is_null());

    // Altéré, rien de remarqué : tout paraît normal.
    let altere = essai.alix("GET /api/joueur/plis/{id}", &[&id("e5")], None).await.json();
    essai.vrai(
        "pli altéré : la version livrée",
        altere["contenu"]["texte"] == "Version livrée, lisible.",
    );
    essai.vrai(
        "pli altéré : le sceau brisé paraît intact",
        altere["exterieur"]["sceau"]["etat"] == "intact",
    );
    essai.vrai(
        "pli altéré : aucun passage réécrit",
        altere["contenu"]["passages_reecrits"] == json!([]),
    );
    essai.vrai(
        "pli altéré : pas de main du faussaire",
        altere["contenu"]["police_reecriture"].is_null(),
    );
    essai.vrai(
        "pli altéré : la signature contrefaite paraît normale",
        altere["contenu"]["signature"]["nom"] == "Damien",
    );
}

/// Les gestes sur ce qui n'est pas à Alix, ou pas encore arrivé : 404, et rien ne change.
async fn gestes_interdits_a_alix(essai: &mut Essai) {
    let brouillon = json!({ "texte": "Piraté", "destinataire": null, "sceau_id": null, "signe": false });
    for cible in tous_les_identifiants() {
        if cible != id("d1") {
            let r = essai
                .alix("PUT /api/joueur/brouillons/{id}", &[&cible], Some(brouillon.clone()))
                .await;
            essai.statut(&format!("modifier le brouillon {cible}"), &r, StatusCode::NOT_FOUND);
            let r = essai.alix("DELETE /api/joueur/brouillons/{id}", &[&cible], None).await;
            essai.statut(&format!("jeter le brouillon {cible}"), &r, StatusCode::NOT_FOUND);
            let r = essai
                .alix("POST /api/joueur/brouillons/{id}/envoi", &[&cible], None)
                .await;
            essai.statut(&format!("envoyer le brouillon {cible}"), &r, StatusCode::NOT_FOUND);
            essai.examiner_pour_alix(&format!("envoyer le brouillon {cible}"), &r.texte, &[]);
        }

        if ![id("e4"), id("e5"), id("e6")].contains(&cible) {
            let r = essai
                .alix("POST /api/joueur/plis/{id}/ouverture", &[&cible], None)
                .await;
            essai.statut(&format!("ouvrir {cible}"), &r, StatusCode::NOT_FOUND);
            essai.examiner_pour_alix(&format!("ouvrir {cible}"), &r.texte, &[]);
            let r = essai
                .alix("PUT /api/joueur/plis/{id}/dossier", &[&cible], Some(json!({ "dossier_id": null })))
                .await;
            essai.statut(&format!("ranger {cible}"), &r, StatusCode::NOT_FOUND);
            let r = essai.alix("DELETE /api/joueur/plis/{id}", &[&cible], None).await;
            essai.statut(&format!("détruire {cible}"), &r, StatusCode::NOT_FOUND);
        }

        if cible != id("f1") {
            let r = essai
                .alix("PUT /api/joueur/dossiers/{id}", &[&cible], Some(json!({ "nom": "Piraté" })))
                .await;
            essai.statut(&format!("renommer le dossier {cible}"), &r, StatusCode::NOT_FOUND);
            let r = essai.alix("DELETE /api/joueur/dossiers/{id}", &[&cible], None).await;
            essai.statut(&format!("supprimer le dossier {cible}"), &r, StatusCode::NOT_FOUND);
        }
    }

    // Ranger son propre pli dans le dossier d'un autre.
    let r = essai
        .alix("PUT /api/joueur/plis/{id}/dossier", &[&id("e4")], Some(json!({ "dossier_id": id("f2") })))
        .await;
    essai.statut("ranger dans le dossier de Bertrand", &r, StatusCode::NOT_FOUND);

    // Tout ou rien : un pli d'un autre dans le lot, et aucun ne bouge.
    let r = essai
        .alix(
            "PUT /api/joueur/rangement",
            &[],
            Some(json!({ "plis": [id("e4"), id("e7")], "dossier_id": id("f1") })),
        )
        .await;
    essai.statut("ranger un lot qui contient le pli de Bertrand", &r, StatusCode::NOT_FOUND);
    let r = essai
        .alix("POST /api/joueur/destruction", &[], Some(json!({ "plis": [id("e4"), id("e7")] })))
        .await;
    essai.statut("détruire un lot qui contient le pli de Bertrand", &r, StatusCode::NOT_FOUND);
    let r = essai
        .alix("POST /api/joueur/destruction", &[], Some(json!({ "plis": [id("e1"), id("e2"), id("e3")] })))
        .await;
    essai.statut("détruire des plis pas encore arrivés", &r, StatusCode::NOT_FOUND);

    // Écrire à quelqu'un qui n'est pas dans son carnet.
    let r = essai
        .alix(
            "PUT /api/joueur/brouillons/{id}",
            &[&id("d1")],
            Some(json!({
                "texte": "BROUILLON-ALIX",
                "destinataire": { "genre": "personnage", "id": id("a3") },
                "sceau_id": null,
                "signe": false
            })),
        )
        .await;
    essai.statut("écrire hors de son carnet", &r, StatusCode::BAD_REQUEST);
    essai.examiner_pour_alix("écrire hors de son carnet", &r.texte, &[]);

    // Se désabonner à la place de Bertrand : rien ne bouge.
    let r = essai
        .alix(
            "DELETE /api/joueur/abonnements",
            &[],
            Some(json!({ "endpoint": "https://push.exemple/BERTRAND-ABONNEMENT" })),
        )
        .await;
    essai.examiner_pour_alix("désabonner Bertrand", &r.texte, &[]);
}

/// Chaque route du MJ : 403 pour un joueur, 401 sans session.
async fn porte_du_mj(essai: &mut Essai) {
    let cible = id("a1");
    for route in routes_declarees("src/acces/mj/mod.rs", "/api/mj") {
        let parametres = vec![cible.as_str(); route.matches('{').count()];
        let r = essai
            .appel(&route, &parametres, Some(ALIX), None, Some(json!({})))
            .await;
        essai.statut(&format!("{route}, par Alix"), &r, StatusCode::FORBIDDEN);
        essai.examiner_pour_alix(&format!("{route}, par Alix"), &r.texte, &[]);
        let r = essai.appel(&route, &parametres, None, None, Some(json!({}))).await;
        essai.statut(&format!("{route}, sans session"), &r, StatusCode::UNAUTHORIZED);
    }
}

/// Chaque tâche : 401 sans le secret, même avec une session.
async fn porte_des_taches(essai: &mut Essai) {
    for route in routes_declarees("src/taches/mod.rs", "/api/taches") {
        for (qui, jeton, autorisation) in [
            ("personne", None, None),
            ("un faux secret", None, Some("Bearer faux")),
            ("le secret sans « Bearer »", None, Some(SECRET)),
            ("Alix", Some(ALIX), None),
            ("le MJ", Some(MJ), None),
        ] {
            let r = essai.appel(&route, &[], jeton, autorisation, None).await;
            essai.statut(&format!("{route}, par {qui}"), &r, StatusCode::UNAUTHORIZED);
        }
    }
}

/// Ce qu'Alix a le droit de faire : chaque réponse est examinée à son tour.
async fn gestes_permis_a_alix(essai: &mut Essai) {
    // Un brouillon neuf : le sceau de Bertrand ne peut pas le fermer.
    let r = essai.alix("POST /api/joueur/brouillons", &[], None).await;
    essai.statut("commencer un brouillon", &r, StatusCode::OK);
    essai.examiner_pour_alix("commencer un brouillon", &r.texte, &[]);
    let neuf = r.json()["id"].as_str().unwrap_or_default().to_owned();
    let r = essai
        .alix(
            "PUT /api/joueur/brouillons/{id}",
            &[&neuf],
            Some(json!({
                "texte": "Bonjour",
                "destinataire": { "genre": "personnage", "id": id("a5") },
                "sceau_id": id("c3"),
                "signe": true
            })),
        )
        .await;
    essai.statut("enregistrer un brouillon", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("GET /api/joueur/brouillons/{id}", &[&neuf], None).await;
    essai.vrai("un sceau qu'on ne détient pas ne ferme pas le pli", r.json()["sceau_id"].is_null());
    let r = essai.alix("DELETE /api/joueur/brouillons/{id}", &[&neuf], None).await;
    essai.statut("jeter un brouillon", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("GET /api/joueur/brouillons/{id}", &[&neuf], None).await;
    essai.statut("brouillon jeté", &r, StatusCode::NOT_FOUND);

    // Envoyer : la lettre ne lui appartient plus.
    let r = essai
        .alix(
            "PUT /api/joueur/brouillons/{id}",
            &[&id("d1")],
            Some(json!({
                "texte": "BROUILLON-ALIX",
                "destinataire": { "genre": "personnage", "id": id("a5") },
                "sceau_id": id("c1"),
                "signe": true
            })),
        )
        .await;
    essai.statut("préparer l'envoi", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("POST /api/joueur/brouillons/{id}/envoi", &[&id("d1")], None).await;
    essai.statut("envoyer", &r, StatusCode::OK);
    essai.examiner_pour_alix("envoyer", &r.texte, &[]);
    essai.vrai("envoyer : deux envois cette semaine", r.json()["lettres_restantes"] == 1);
    let r = essai.alix("GET /api/joueur/brouillons/{id}", &[&id("d1")], None).await;
    essai.statut("relire une lettre envoyée", &r, StatusCode::NOT_FOUND);
    let r = essai.alix("POST /api/joueur/brouillons/{id}/envoi", &[&id("d1")], None).await;
    essai.statut("envoyer deux fois", &r, StatusCode::NOT_FOUND);
    let r = essai.alix("GET /api/joueur/ecritoire", &[], None).await;
    essai.vrai(
        "écritoire après l'envoi : la lettre a disparu",
        !r.texte.contains("BROUILLON-ALIX"),
    );

    // Ouvrir : le contenu paraît, une fois ouvert seulement.
    let r = essai.alix("POST /api/joueur/plis/{id}/ouverture", &[&id("e4")], None).await;
    essai.statut("ouvrir", &r, StatusCode::OK);
    essai.examiner_pour_alix("ouvrir", &r.texte, &["FERME"]);
    essai.vrai("ouvrir : le texte paraît", r.json()["contenu"]["texte"] == "FERME");
    let r = essai.alix("POST /api/joueur/plis/{id}/ouverture", &[&id("e4")], None).await;
    essai.statut("rouvrir", &r, StatusCode::OK);
    essai.sql_vrai(
        "ouvrir : le propriétaire du sceau entre au carnet, pas son détenteur",
        "select exists (select 1 from contacts where proprietaire_id = '00000000-0000-0000-0000-0000000000a1'
                        and personnage_id = '00000000-0000-0000-0000-0000000000a5')
            and not exists (select 1 from contacts where proprietaire_id = '00000000-0000-0000-0000-0000000000a1'
                        and personnage_id = '00000000-0000-0000-0000-0000000000a4')",
    )
    .await;

    // Ranger, dossiers.
    let r = essai
        .alix("PUT /api/joueur/plis/{id}/dossier", &[&id("e4")], Some(json!({ "dossier_id": id("f1") })))
        .await;
    essai.statut("ranger", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("GET /api/joueur/dossiers/{id}", &[&id("f1")], None).await;
    essai.examiner_pour_alix("dossier", &r.texte, &["FERME"]);
    essai.vrai("dossier : ses deux plis", ids_de(&r.json()["plis"]) == ensemble(&["e4", "e5"]));
    let r = essai
        .alix(
            "PUT /api/joueur/rangement",
            &[],
            Some(json!({ "plis": [id("e4"), id("e5")], "dossier_id": null })),
        )
        .await;
    essai.statut("ranger un lot", &r, StatusCode::NO_CONTENT);

    let r = essai.alix("POST /api/joueur/dossiers", &[], Some(json!({ "nom": "Preuves" }))).await;
    essai.statut("créer un dossier", &r, StatusCode::OK);
    let dossier = r.json()["id"].as_str().unwrap_or_default().to_owned();
    let r = essai
        .alix("PUT /api/joueur/dossiers/{id}", &[&dossier], Some(json!({ "nom": "Indices" })))
        .await;
    essai.statut("renommer un dossier", &r, StatusCode::OK);
    let r = essai
        .alix("PUT /api/joueur/plis/{id}/dossier", &[&id("e6")], Some(json!({ "dossier_id": dossier })))
        .await;
    essai.statut("ranger dans le nouveau dossier", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("DELETE /api/joueur/dossiers/{id}", &[&dossier], None).await;
    essai.statut("supprimer un dossier plein", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("GET /api/joueur/plis/{id}", &[&id("e6")], None).await;
    essai.statut("un pli détruit avec son dossier", &r, StatusCode::NOT_FOUND);

    // Détruire.
    let r = essai
        .alix("POST /api/joueur/destruction", &[], Some(json!({ "plis": [id("e5")] })))
        .await;
    essai.statut("détruire un lot", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("DELETE /api/joueur/plis/{id}", &[&id("e4")], None).await;
    essai.statut("détruire", &r, StatusCode::NO_CONTENT);
    let r = essai.alix("GET /api/joueur/reception", &[], None).await;
    essai.examiner_pour_alix("réception vidée", &r.texte, &[]);
    essai.vrai("réception vidée", ids_de(&r.json()["plis"]).is_empty());
    essai.sql_vrai(
        "les plis détruits restent dans la base",
        "select count(*) = 4 from exemplaires where detruit_le is not null",
    )
    .await;

    // Ses notifications.
    let r = essai
        .alix(
            "PUT /api/joueur/notifications",
            &[],
            Some(json!({ "email_arrivee": false, "email_rappel": true, "rappel_heures": 12 })),
        )
        .await;
    essai.statut("choisir ses notifications", &r, StatusCode::OK);
    essai.examiner_pour_alix("choisir ses notifications", &r.texte, &[]);
    let abonnement = json!({
        "endpoint": "https://push.exemple/alix",
        "keys": { "p256dh": "cle", "auth": "auth" }
    });
    let r = essai.alix("POST /api/joueur/abonnements", &[], Some(abonnement)).await;
    essai.statut("s'abonner", &r, StatusCode::NO_CONTENT);
    let r = essai
        .alix("DELETE /api/joueur/abonnements", &[], Some(json!({ "endpoint": "https://push.exemple/alix" })))
        .await;
    essai.statut("se désabonner", &r, StatusCode::NO_CONTENT);

    let r = essai.alix("GET /api/joueur/pastille", &[], None).await;
    essai.vrai("pastille : plus rien à ouvrir", r.json()["nombre"] == 0);

    // Rien de ce qui est à Bertrand n'a bougé.
    essai
        .sql_vrai(
            "les affaires de Bertrand sont intactes",
            "select (select count(*) from brouillons where id = '00000000-0000-0000-0000-0000000000d2') = 1
                and (select detruit_le is null and dossier_id = '00000000-0000-0000-0000-0000000000f2'
                     from exemplaires where id = '00000000-0000-0000-0000-0000000000e7')
                and (select nom = 'BERTRAND-DOSSIER' from dossiers where id = '00000000-0000-0000-0000-0000000000f2')
                and (select count(*) = 1 from abonnements_navigateur where endpoint like '%BERTRAND%')",
        )
        .await;
}

/// Bertrand, de son côté, ne voit rien d'Alix.
async fn lectures_de_bertrand(essai: &mut Essai) {
    for route in [
        "GET /api/joueur/ecritoire",
        "GET /api/joueur/reception",
        "GET /api/joueur/fiche",
        "GET /api/joueur/notifications",
        "GET /api/moi",
    ] {
        let r = essai.bertrand(route, &[], None).await;
        essai.statut(&format!("{route}, par Bertrand"), &r, StatusCode::OK);
        let texte = if route.ends_with("ecritoire") {
            sans_dates_de_brouillon(r.json())
        } else {
            r.texte
        };
        essai.examiner_pour_bertrand(route, &texte);
    }
    let r = essai.bertrand("GET /api/joueur/dossiers/{id}", &[&id("f2")], None).await;
    essai.statut("son dossier", &r, StatusCode::OK);
    essai.vrai("son dossier : son pli", ids_de(&r.json()["plis"]) == ensemble(&["e7"]));
    for cible in tous_les_identifiants() {
        let r = essai.bertrand("GET /api/joueur/plis/{id}", &[&cible], None).await;
        let attendu = if cible == id("e7") { StatusCode::OK } else { StatusCode::NOT_FOUND };
        essai.statut(&format!("pli {cible}, par Bertrand"), &r, attendu);
        essai.examiner_pour_bertrand(&format!("pli {cible}"), &r.texte);
        let r = essai.bertrand("GET /api/joueur/brouillons/{id}", &[&cible], None).await;
        let attendu = if cible == id("d2") { StatusCode::OK } else { StatusCode::NOT_FOUND };
        essai.statut(&format!("brouillon {cible}, par Bertrand"), &r, attendu);
        let r = essai.bertrand("GET /api/joueur/dossiers/{id}", &[&cible], None).await;
        let attendu = if cible == id("f2") { StatusCode::OK } else { StatusCode::NOT_FOUND };
        essai.statut(&format!("dossier {cible}, par Bertrand"), &r, attendu);
    }
}

/// Les routes hors des portes.
async fn routes_publiques(essai: &mut Essai) {
    let r = essai.appel("GET /api/sante", &[], None, None, None).await;
    essai.statut("santé", &r, StatusCode::OK);
    essai.vrai("santé : rien du jeu", !r.texte.contains('@') && !r.texte.contains("0000000000"));

    let r = essai.appel("GET /api/moi", &[], None, None, None).await;
    essai.statut("moi, sans session", &r, StatusCode::UNAUTHORIZED);

    // Le site ne dit pas qui a un compte.
    let connu = essai
        .appel("POST /api/connexion/demande", &[], None, None, Some(json!({ "email": "alix@exemple.fr" })))
        .await;
    let inconnu = essai
        .appel("POST /api/connexion/demande", &[], None, None, Some(json!({ "email": "personne@exemple.fr" })))
        .await;
    essai.vrai(
        "connexion : même réponse pour une adresse connue et une inconnue",
        connu.statut == inconnu.statut && connu.texte == inconnu.texte,
    );

    let r = essai
        .appel(
            "POST /api/connexion/code",
            &[],
            None,
            None,
            Some(json!({ "email": "alix@exemple.fr", "code": "000000" })),
        )
        .await;
    essai.statut("un faux code", &r, StatusCode::BAD_REQUEST);
    essai.vrai("un faux code : pas de session", !r.texte.contains("session"));
    let r = essai
        .appel("POST /api/connexion/lien", &[], None, None, Some(json!({ "jeton": "faux" })))
        .await;
    essai.statut("un faux lien", &r, StatusCode::BAD_REQUEST);

    // Se déconnecter ferme bien la session.
    let r = essai.appel("POST /api/deconnexion", &[], Some(BERTRAND), None, None).await;
    essai.statut("déconnexion", &r, StatusCode::NO_CONTENT);
    let r = essai.bertrand("GET /api/joueur/fiche", &[], None).await;
    essai.statut("après la déconnexion", &r, StatusCode::UNAUTHORIZED);
}
