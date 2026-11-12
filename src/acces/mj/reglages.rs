//! Les réglages généraux, et le calendrier du jeu. Les joueurs n'en voient que les effets.
//!
//! Les bonds dans le temps sont datés : chacun compte à partir de son jour, et ne change
//! pas la date des plis reçus avant (décision du MJ, étape 7). L'ancienne colonne
//! `reglages.calendrier_bonds` n'est plus lue.

use axum::Json;
use axum::extract::Path;
use axum::http::StatusCode;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use crate::acces::Mj;
use crate::base;
use crate::calendrier::{Calendrier, DateJeu};
use crate::erreur::Erreur;

#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Reglages {
    /// Longueur maximale d'un billet, en caractères.
    pub longueur_billet: i32,
    /// Lettres par semaine et par joueur.
    pub quota_hebdo: i32,
    /// Délai de livraison par défaut, en minutes.
    pub delai_minutes: i32,
    /// Part de hasard autour du délai, en minutes.
    pub hasard_minutes: i32,
    /// Le jour réel qui vaut « jour 1 » du calendrier du jeu.
    pub calendrier_debut: NaiveDate,
}

/// Le calendrier du jeu, vu par le MJ.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct CalendrierMj {
    /// La date du jeu d'aujourd'hui, bonds compris.
    pub aujourd_hui: DateJeu,
    /// Le jour réel d'aujourd'hui, à Paris : la date proposée pour un nouveau bond.
    pub jour_reel: NaiveDate,
    /// Du plus ancien au plus récent.
    pub bonds: Vec<Bond>,
}

/// Un bond dans le temps.
#[derive(Serialize, TS)]
#[ts(export)]
pub struct Bond {
    pub id: Uuid,
    /// Le jour réel à partir duquel le bond compte.
    pub a_partir_du: NaiveDate,
    pub jours: i32,
    pub note: String,
}

#[derive(Deserialize, TS)]
#[ts(export)]
pub struct NouveauBond {
    pub a_partir_du: NaiveDate,
    pub jours: i32,
    pub note: String,
}

pub async fn lire(_mj: Mj) -> Result<Json<Reglages>, Erreur> {
    let pool = base::pool().await?;
    let reglages = sqlx::query_as!(
        Reglages,
        r#"
        select longueur_billet, quota_hebdo, delai_minutes, hasard_minutes, calendrier_debut
        from reglages
        "#
    )
    .fetch_one(pool)
    .await?;
    Ok(Json(reglages))
}

pub async fn modifier(mj: Mj, Json(saisie): Json<Reglages>) -> Result<Json<Reglages>, Erreur> {
    if saisie.longueur_billet < 1 || saisie.longueur_billet > 10_000 {
        return Err(Erreur::Refus("La longueur d'un billet doit être comprise entre 1 et 10 000 caractères."));
    }
    if saisie.quota_hebdo < 0 || saisie.delai_minutes < 0 || saisie.hasard_minutes < 0 {
        return Err(Erreur::Refus("Le quota, le délai et le hasard ne peuvent pas être négatifs."));
    }
    if saisie.hasard_minutes > saisie.delai_minutes {
        return Err(Erreur::Refus("Le hasard ne peut pas dépasser le délai : une lettre arriverait avant d'être partie."));
    }

    let pool = base::pool().await?;
    sqlx::query!(
        r#"
        update reglages
        set longueur_billet = $1, quota_hebdo = $2, delai_minutes = $3, hasard_minutes = $4,
            calendrier_debut = $5, modifie_le = now()
        "#,
        saisie.longueur_billet,
        saisie.quota_hebdo,
        saisie.delai_minutes,
        saisie.hasard_minutes,
        saisie.calendrier_debut,
    )
    .execute(pool)
    .await?;

    lire(mj).await
}

pub async fn calendrier(_mj: Mj) -> Result<Json<CalendrierMj>, Erreur> {
    let pool = base::pool().await?;
    let calendrier = Calendrier::lire(pool).await?;
    let jour_reel = sqlx::query_scalar!(
        r#"select (now() at time zone fuseau)::date as "jour!" from reglages"#
    )
    .fetch_one(pool)
    .await?;
    let bonds = sqlx::query_as!(
        Bond,
        "select id, a_partir_du, jours, note from bonds_calendrier order by a_partir_du, cree_le"
    )
    .fetch_all(pool)
    .await?;
    Ok(Json(CalendrierMj {
        aujourd_hui: calendrier.aujourd_hui(),
        jour_reel,
        bonds,
    }))
}

pub async fn ajouter_bond(mj: Mj, Json(saisie): Json<NouveauBond>) -> Result<Json<CalendrierMj>, Erreur> {
    if saisie.jours < 1 || saisie.jours > 36_500 {
        return Err(Erreur::Refus("Un bond avance le temps d'au moins un jour, et de cent ans au plus."));
    }
    let note = saisie.note.trim();
    if note.chars().count() > 200 {
        return Err(Erreur::Refus("La note d'un bond compte 200 caractères au plus."));
    }

    let pool = base::pool().await?;
    sqlx::query!(
        "insert into bonds_calendrier (a_partir_du, jours, note) values ($1, $2, $3)",
        saisie.a_partir_du,
        saisie.jours,
        note,
    )
    .execute(pool)
    .await?;
    calendrier(mj).await
}

pub async fn retirer_bond(_mj: Mj, Path(id): Path<Uuid>) -> Result<StatusCode, Erreur> {
    let pool = base::pool().await?;
    let retire = sqlx::query!("delete from bonds_calendrier where id = $1", id)
        .execute(pool)
        .await?;
    if retire.rows_affected() == 0 {
        return Err(Erreur::Introuvable);
    }
    Ok(StatusCode::NO_CONTENT)
}
