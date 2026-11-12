//! Le calendrier du jeu.
//!
//! Un jour réel vaut un jour de jeu. Le premier jour du jeu est le « 1er jour du 1er mois,
//! an 1 », puis le temps avance comme dans le calendrier réel à partir d'un 1er janvier :
//! le 1er mois a 31 jours, le 2e en a 28, etc. Le jour change à minuit, heure de Paris.
//!
//! Le MJ peut faire des bonds dans le temps. Un bond compte à partir de son jour : un pli
//! reçu avant garde la date qu'il avait.
//!
//! Règle : un joueur ne reçoit jamais d'horodatage de pli, seulement des [`DateJeu`].
//! Le jour réel d'un horodatage se calcule en SQL, dans le fuseau des réglages :
//! `(horodatage at time zone r.fuseau)::date`.

use chrono::{Datelike, Days, NaiveDate};
use serde::Serialize;
use sqlx::PgPool;
use ts_rs::TS;

/// Une date du calendrier du jeu, sans heure.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct DateJeu {
    pub an: i32,
    pub mois: u32,
    pub jour: u32,
}

/// La date du jeu qui correspond à un jour réel.
///
/// `bonds` : les bonds dans le temps, chacun avec le jour réel à partir duquel il compte.
pub fn date_du_jeu(jour_reel: NaiveDate, debut: NaiveDate, bonds: &[(NaiveDate, i32)]) -> DateJeu {
    let ecoules = (jour_reel - debut).num_days();
    let sautes: i64 = bonds
        .iter()
        .filter(|(a_partir_du, _)| *a_partir_du <= jour_reel)
        .map(|(_, jours)| i64::from(*jours))
        .sum();
    let n = ecoules + sautes;

    let premier = NaiveDate::from_ymd_opt(1, 1, 1).unwrap_or(NaiveDate::MIN);
    // Avant le début du jeu, on reste au premier jour.
    let date = u64::try_from(n)
        .ok()
        .and_then(|n| premier.checked_add_days(Days::new(n)))
        .unwrap_or(premier);

    DateJeu {
        an: date.year(),
        mois: date.month(),
        jour: date.day(),
    }
}

/// Le calendrier tel que réglé par le MJ, lu une fois par requête pour convertir
/// plusieurs dates.
pub struct Calendrier {
    debut: NaiveDate,
    bonds: Vec<(NaiveDate, i32)>,
    /// Le jour réel d'aujourd'hui, à Paris.
    aujourd_hui: NaiveDate,
}

impl Calendrier {
    pub async fn lire(pool: &PgPool) -> Result<Self, sqlx::Error> {
        let reglages = sqlx::query!(
            r#"
            select calendrier_debut, (now() at time zone fuseau)::date as "aujourd_hui!"
            from reglages
            "#
        )
        .fetch_one(pool)
        .await?;

        let bonds = sqlx::query!("select a_partir_du, jours from bonds_calendrier")
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|bond| (bond.a_partir_du, bond.jours))
            .collect();

        Ok(Self {
            debut: reglages.calendrier_debut,
            bonds,
            aujourd_hui: reglages.aujourd_hui,
        })
    }

    /// La date du jeu d'un jour réel (déjà ramené à Paris).
    pub fn date(&self, jour_reel: NaiveDate) -> DateJeu {
        date_du_jeu(jour_reel, self.debut, &self.bonds)
    }

    /// La date du jeu d'aujourd'hui.
    pub fn aujourd_hui(&self) -> DateJeu {
        self.date(self.aujourd_hui)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jour(an: i32, mois: u32, jour: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(an, mois, jour).expect("date valide")
    }

    fn date(an: i32, mois: u32, jour: u32) -> DateJeu {
        DateJeu { an, mois, jour }
    }

    const DEBUT: (i32, u32, u32) = (2026, 11, 20);

    fn apres(n: u64) -> NaiveDate {
        jour(DEBUT.0, DEBUT.1, DEBUT.2) + Days::new(n)
    }

    fn sans_bond(n: u64) -> DateJeu {
        date_du_jeu(apres(n), apres(0), &[])
    }

    #[test]
    fn premier_jour() {
        assert_eq!(sans_bond(0), date(1, 1, 1));
    }

    #[test]
    fn le_premier_mois_a_trente_et_un_jours() {
        assert_eq!(sans_bond(30), date(1, 1, 31));
        assert_eq!(sans_bond(31), date(1, 2, 1));
    }

    #[test]
    fn le_deuxieme_mois_a_vingt_huit_jours() {
        assert_eq!(sans_bond(58), date(1, 2, 28));
        assert_eq!(sans_bond(59), date(1, 3, 1));
    }

    #[test]
    fn une_annee_plus_tard() {
        assert_eq!(sans_bond(364), date(1, 12, 31));
        assert_eq!(sans_bond(365), date(2, 1, 1));
    }

    #[test]
    fn un_bond_ne_compte_qu_a_partir_de_son_jour() {
        let bonds = [(apres(5), 10)];
        // La veille du bond : rien ne change.
        assert_eq!(date_du_jeu(apres(4), apres(0), &bonds), date(1, 1, 5));
        // Le jour du bond et après : dix jours de plus.
        assert_eq!(date_du_jeu(apres(5), apres(0), &bonds), date(1, 1, 16));
        assert_eq!(date_du_jeu(apres(6), apres(0), &bonds), date(1, 1, 17));
    }

    #[test]
    fn les_bonds_s_additionnent() {
        let bonds = [(apres(1), 10), (apres(2), 30)];
        assert_eq!(date_du_jeu(apres(2), apres(0), &bonds), date(1, 2, 12));
    }

    #[test]
    fn avant_le_debut_du_jeu() {
        let debut = apres(10);
        assert_eq!(date_du_jeu(apres(0), debut, &[]), date(1, 1, 1));
    }
}
