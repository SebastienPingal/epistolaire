//! L'écritoire : les brouillons d'un joueur, et l'envoi de ses lettres.
//!
//! Une lettre est un objet : une fois envoyée, son auteur n'en garde aucune copie.
//! Tout ce fichier lit et écrit les brouillons à travers la vue `brouillons`,
//! qui ne contient plus une lettre dès qu'elle est partie.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use ts_rs::TS;
use uuid::Uuid;

use crate::acces::Joueur;
use crate::base;
use crate::erreur::Erreur;
use crate::modele::GenreDestinataire;

/// Un brouillon peut déborder du billet, mais pas sans fin.
const LONGUEUR_BROUILLON_MAX: usize = 20_000;
/// Nombre de brouillons qu'un joueur peut garder en même temps.
const BROUILLONS_MAX: i64 = 20;

// ---------------------------------------------------------------------------
// Ce qui s'échange avec l'interface
// ---------------------------------------------------------------------------

/// Tout ce qu'il faut pour écrire : ses brouillons, son carnet, ses sceaux, sa main.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Ecritoire {
    /// La longueur d'un billet. Elle sert à dessiner la jauge ; elle n'est jamais affichée.
    pub longueur_billet: i32,
    pub lettres_restantes: i32,
    pub brouillons: Vec<BrouillonResume>,
    pub carnet: Vec<Contact>,
    pub sceaux: Vec<MonSceau>,
    /// Le nom du personnage : c'est sa signature.
    pub nom: String,
    /// La police de son écriture, si le MJ lui en a attribué une.
    pub police: Option<String>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct BrouillonResume {
    pub id: Uuid,
    /// À qui il est adressé, en clair. Vide tant que ce n'est pas choisi.
    pub destinataire: Option<String>,
    /// Les premiers mots du texte.
    pub debut: String,
    pub modifie_le: DateTime<Utc>,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct Contact {
    pub personnage_id: Uuid,
    pub nom: String,
    /// Ce que ce joueur sait de lui : « trésorier ».
    pub qualite: Option<String>,
}

/// Un sceau que le joueur détient. Il porte le nom de son propriétaire d'origine.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct MonSceau {
    pub id: Uuid,
    pub nom_grave: String,
    pub initiales: String,
    pub image_url: Option<String>,
}

/// À qui une lettre est adressée.
#[derive(Serialize, Deserialize, Clone, TS)]
#[serde(tag = "genre", rename_all = "snake_case")]
#[ts(export)]
pub enum Destinataire {
    /// Un personnage du carnet.
    Personnage { id: Uuid },
    Gazette,
    /// Une adresse écrite librement, que le MJ interprétera.
    Libre { adresse: String },
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct Brouillon {
    pub id: Uuid,
    pub texte: String,
    pub destinataire: Option<Destinataire>,
    /// Le sceau qui fermera le pli. Vide : pas de sceau.
    pub sceau_id: Option<Uuid>,
    pub signe: bool,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct BrouillonSaisi {
    pub texte: String,
    pub destinataire: Option<Destinataire>,
    pub sceau_id: Option<Uuid>,
    pub signe: bool,
}

#[derive(Serialize, TS)]
#[ts(export)]
pub struct Envoi {
    pub lettres_restantes: i32,
}

// ---------------------------------------------------------------------------
// Les traitements
// ---------------------------------------------------------------------------

pub async fn lire(joueur: Joueur) -> Result<Json<Ecritoire>, Erreur> {
    let pool = base::pool().await?;
    let moi = joueur.personnage_id();

    let cadre = cadre(pool, &joueur).await?;

    let brouillons = sqlx::query!(
        r#"
        select
            b.id as "id!",
            b.destinataire_genre as "genre: GenreDestinataire",
            p.nom as "nom?",
            b.destinataire_libre,
            left(b.contenu->>'texte', 90) as "debut",
            b.modifie_le as "modifie_le!"
        from brouillons b
        left join personnages p on p.id = b.destinataire_id
        where b.auteur_id = $1
        order by b.modifie_le desc
        "#,
        moi,
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|ligne| BrouillonResume {
        id: ligne.id,
        destinataire: match ligne.genre {
            Some(GenreDestinataire::Personnage) => ligne.nom,
            Some(GenreDestinataire::Libre) => ligne.destinataire_libre,
            // L'interface connaît le nom que l'univers donne à la gazette.
            Some(GenreDestinataire::Gazette) => Some(String::new()),
            None => None,
        },
        debut: ligne.debut.unwrap_or_default(),
        modifie_le: ligne.modifie_le,
    })
    .collect();

    let carnet = sqlx::query_as!(
        Contact,
        r#"
        select k.personnage_id, p.nom, k.qualite
        from contacts k
        join personnages p on p.id = k.personnage_id
        where k.proprietaire_id = $1
        order by lower(p.nom)
        "#,
        moi,
    )
    .fetch_all(pool)
    .await?;

    let identite = sqlx::query!(
        r#"
        select p.nom, e.police as "police?"
        from personnages p
        left join ecritures e on e.id = p.ecriture_id
        where p.id = $1
        "#,
        moi,
    )
    .fetch_one(pool)
    .await?;

    Ok(Json(Ecritoire {
        longueur_billet: cadre.longueur_billet,
        lettres_restantes: cadre.lettres_restantes(),
        brouillons,
        carnet,
        sceaux: mes_sceaux(pool, &joueur).await?,
        nom: identite.nom,
        police: identite.police,
    }))
}

/// Pose un billet vierge sur l'écritoire.
pub async fn commencer(joueur: Joueur) -> Result<Json<Brouillon>, Erreur> {
    let pool = base::pool().await?;
    let moi = joueur.personnage_id();

    let en_cours = sqlx::query_scalar!(
        r#"select count(*) as "nombre!" from brouillons where auteur_id = $1"#,
        moi,
    )
    .fetch_one(pool)
    .await?;
    if en_cours >= BROUILLONS_MAX {
        return Err(Erreur::Refus("Votre écritoire est pleine : envoyez ou jetez un brouillon avant d'en commencer un autre."));
    }

    let id = sqlx::query_scalar!(
        r#"
        insert into brouillons (auteur_id, gabarit, contenu)
        values ($1, 'billet', jsonb_build_object('texte', ''))
        returning id as "id!"
        "#,
        moi,
    )
    .fetch_one(pool)
    .await?;

    Ok(Json(Brouillon {
        id,
        texte: String::new(),
        destinataire: None,
        sceau_id: None,
        signe: false,
    }))
}

pub async fn lire_brouillon(
    joueur: Joueur,
    Path(id): Path<Uuid>,
) -> Result<Json<Brouillon>, Erreur> {
    let pool = base::pool().await?;
    Ok(Json(brouillon(pool, &joueur, id).await?))
}

/// La sauvegarde automatique : elle accepte un brouillon inachevé ou trop long.
pub async fn enregistrer(
    joueur: Joueur,
    Path(id): Path<Uuid>,
    Json(saisie): Json<BrouillonSaisi>,
) -> Result<StatusCode, Erreur> {
    if saisie.texte.chars().count() > LONGUEUR_BROUILLON_MAX {
        return Err(Erreur::Refus("Ce texte est bien trop long pour un billet."));
    }
    let pool = base::pool().await?;
    let moi = joueur.personnage_id();

    let destinataire = match saisie.destinataire {
        Some(destinataire) => Some(destinataire_permis(pool, &joueur, destinataire).await?),
        None => None,
    };
    let (genre, destinataire_id, libre) = match destinataire {
        Some(Destinataire::Personnage { id }) => (Some(GenreDestinataire::Personnage), Some(id), None),
        Some(Destinataire::Gazette) => (Some(GenreDestinataire::Gazette), None, None),
        Some(Destinataire::Libre { adresse }) => (Some(GenreDestinataire::Libre), None, Some(adresse)),
        None => (None, None, None),
    };

    // Un sceau qu'on ne détient pas (ou plus) ne peut pas fermer un pli.
    let sceau_id = match saisie.sceau_id {
        Some(sceau_id) if detient(pool, &joueur, sceau_id).await? => Some(sceau_id),
        _ => None,
    };

    let enregistre = sqlx::query!(
        r#"
        update brouillons
        set contenu = jsonb_build_object('texte', $3::text),
            destinataire_genre = $4,
            destinataire_id = $5,
            destinataire_libre = $6,
            sceau_id = $7,
            signe = $8,
            modifie_le = now()
        where id = $1 and auteur_id = $2
        "#,
        id,
        moi,
        saisie.texte,
        genre as Option<GenreDestinataire>,
        destinataire_id,
        libre,
        sceau_id,
        saisie.signe,
    )
    .execute(pool)
    .await?;

    if enregistre.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn jeter(joueur: Joueur, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    sqlx::query!(
        "delete from brouillons where id = $1 and auteur_id = $2",
        id,
        joueur.personnage_id(),
    )
    .execute(pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// L'envoi : définitif. La lettre rejoint la file du MJ et quitte l'écritoire.
pub async fn envoyer(joueur: Joueur, Path(id): Path<Uuid>) -> Result<Json<Envoi>, Erreur> {
    let pool = base::pool().await?;
    let moi = joueur.personnage_id();
    let lettre = brouillon(pool, &joueur, id).await?;

    if lettre.texte.trim().is_empty() {
        return Err(Erreur::Refus("Ce billet est vide."));
    }
    let Some(destinataire) = lettre.destinataire else {
        return Err(Erreur::Refus("Choisissez d'abord à qui vous écrivez."));
    };
    // Le carnet a pu changer depuis le choix du destinataire.
    destinataire_permis(pool, &joueur, destinataire).await?;

    let mut transaction = pool.begin().await?;

    // Verrou sur le personnage : deux envois simultanés ne peuvent pas dépasser le quota.
    sqlx::query!("select id from personnages where id = $1 for update", moi)
        .fetch_one(&mut *transaction)
        .await?;
    let cadre = cadre(&mut *transaction, &joueur).await?;

    if lettre.texte.chars().count() > cadre.longueur_billet as usize {
        return Err(Erreur::Refus("Votre billet déborde : il faut le raccourcir."));
    }
    if cadre.lettres_restantes() == 0 {
        return Err(Erreur::Refus("Vous avez déjà envoyé toutes vos lettres de la semaine."));
    }

    // La date de livraison proposée au MJ : le délai, plus ou moins le hasard.
    let hasard = rand::rng().random_range(-cadre.hasard_minutes..=cadre.hasard_minutes);
    let delai = (cadre.delai_minutes + hasard).max(0);

    // Le sceau doit encore être entre ses mains au moment de fermer le pli.
    let partie = sqlx::query!(
        r#"
        update plis
        set etat = 'a_traiter',
            envoye_le = now(),
            date_proposee = now() + make_interval(mins => $3),
            sceau_id = (select s.id from sceaux s where s.id = plis.sceau_id and s.detenteur_id = $2),
            modifie_le = now()
        where id = $1 and auteur_id = $2 and etat = 'brouillon' and not redige_par_mj
        "#,
        id,
        moi,
        delai,
    )
    .execute(&mut *transaction)
    .await?;
    if partie.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }

    sqlx::query!(
        "insert into evenements (pli_id, genre) values ($1, 'envoi')",
        id,
    )
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;

    Ok(Json(Envoi {
        lettres_restantes: cadre.lettres_restantes() - 1,
    }))
}

// ---------------------------------------------------------------------------
// Rouages
// ---------------------------------------------------------------------------

/// Les réglages qui encadrent l'écriture, et les envois déjà faits cette semaine.
struct Cadre {
    longueur_billet: i32,
    quota: i32,
    envoyees: i64,
    delai_minutes: i32,
    hasard_minutes: i32,
}

impl Cadre {
    fn lettres_restantes(&self) -> i32 {
        (i64::from(self.quota) - self.envoyees).max(0) as i32
    }
}

/// La semaine commence le lundi à 0 h, dans le fuseau des réglages. Tout envoi compte,
/// quel que soit son destinataire et quoi qu'il soit devenu ensuite.
async fn cadre<'c>(
    executeur: impl sqlx::PgExecutor<'c>,
    joueur: &Joueur,
) -> Result<Cadre, Erreur> {
    let cadre = sqlx::query_as!(
        Cadre,
        r#"
        select
            r.longueur_billet,
            coalesce(p.quota_hebdo, r.quota_hebdo) as "quota!",
            (
                select count(*)
                from plis l
                where l.auteur_id = p.id
                  and not l.redige_par_mj
                  and l.envoye_le >= date_trunc('week', now() at time zone r.fuseau)
                                     at time zone r.fuseau
            ) as "envoyees!",
            r.delai_minutes,
            r.hasard_minutes
        from personnages p
        cross join reglages r
        where p.id = $1
        "#,
        joueur.personnage_id(),
    )
    .fetch_one(executeur)
    .await?;
    Ok(cadre)
}

async fn brouillon(pool: &PgPool, joueur: &Joueur, id: Uuid) -> Result<Brouillon, Erreur> {
    let ligne = sqlx::query!(
        r#"
        select
            id as "id!",
            contenu->>'texte' as "texte",
            destinataire_genre as "genre: GenreDestinataire",
            destinataire_id,
            destinataire_libre,
            sceau_id,
            signe as "signe!"
        from brouillons
        where id = $1 and auteur_id = $2
        "#,
        id,
        joueur.personnage_id(),
    )
    .fetch_optional(pool)
    .await?
    .ok_or(Erreur::Introuvable)?;

    Ok(Brouillon {
        id: ligne.id,
        texte: ligne.texte.unwrap_or_default(),
        destinataire: match (ligne.genre, ligne.destinataire_id, ligne.destinataire_libre) {
            (Some(GenreDestinataire::Personnage), Some(id), _) => {
                Some(Destinataire::Personnage { id })
            }
            (Some(GenreDestinataire::Gazette), _, _) => Some(Destinataire::Gazette),
            (Some(GenreDestinataire::Libre), _, Some(adresse)) => {
                Some(Destinataire::Libre { adresse })
            }
            _ => None,
        },
        sceau_id: ligne.sceau_id,
        signe: ligne.signe,
    })
}

/// Vérifie qu'un joueur a le droit d'écrire à ce destinataire, et le met en forme.
/// Un personnage doit figurer dans son carnet : on n'écrit pas à qui l'on ne connaît pas.
async fn destinataire_permis(
    pool: &PgPool,
    joueur: &Joueur,
    destinataire: Destinataire,
) -> Result<Destinataire, Erreur> {
    match destinataire {
        Destinataire::Gazette => Ok(Destinataire::Gazette),
        Destinataire::Libre { adresse } => {
            let adresse = adresse.trim();
            if adresse.is_empty() || adresse.chars().count() > 200 {
                return Err(Erreur::Refus("Écrivez le nom ou l'adresse du destinataire."));
            }
            Ok(Destinataire::Libre {
                adresse: adresse.to_owned(),
            })
        }
        Destinataire::Personnage { id } => {
            let connu = sqlx::query_scalar!(
                r#"
                select exists (
                    select 1 from contacts where proprietaire_id = $1 and personnage_id = $2
                ) as "connu!"
                "#,
                joueur.personnage_id(),
                id,
            )
            .fetch_one(pool)
            .await?;
            if !connu {
                return Err(Erreur::Refus("Ce destinataire ne figure pas dans votre carnet."));
            }
            Ok(Destinataire::Personnage { id })
        }
    }
}

async fn detient(pool: &PgPool, joueur: &Joueur, sceau_id: Uuid) -> Result<bool, Erreur> {
    let detient = sqlx::query_scalar!(
        r#"select exists (select 1 from sceaux where id = $1 and detenteur_id = $2) as "detient!""#,
        sceau_id,
        joueur.personnage_id(),
    )
    .fetch_one(pool)
    .await?;
    Ok(detient)
}

pub(super) async fn mes_sceaux(pool: &PgPool, joueur: &Joueur) -> Result<Vec<MonSceau>, Erreur> {
    let sceaux = sqlx::query_as!(
        MonSceau,
        r#"
        select id, nom_grave, initiales, image_url
        from sceaux
        where detenteur_id = $1
        order by cree_le
        "#,
        joueur.personnage_id(),
    )
    .fetch_all(pool)
    .await?;
    Ok(sceaux)
}
