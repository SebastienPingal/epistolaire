//! Les réglages généraux. Les joueurs n'en voient que les effets.

use axum::Json;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::acces::Mj;
use crate::base;
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
    /// Jours ajoutés par les bonds dans le temps.
    pub calendrier_bonds: i32,
}

pub async fn lire(_mj: Mj) -> Result<Json<Reglages>, Erreur> {
    let pool = base::pool().await?;
    let reglages = sqlx::query_as!(
        Reglages,
        r#"
        select longueur_billet, quota_hebdo, delai_minutes, hasard_minutes,
               calendrier_debut, calendrier_bonds
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
            calendrier_debut = $5, calendrier_bonds = $6, modifie_le = now()
        "#,
        saisie.longueur_billet,
        saisie.quota_hebdo,
        saisie.delai_minutes,
        saisie.hasard_minutes,
        saisie.calendrier_debut,
        saisie.calendrier_bonds,
    )
    .execute(pool)
    .await?;

    lire(mj).await
}
