//! Les passages d'un texte : réécrits par un faussaire, ou abîmés.
//!
//! Un passage désigne des caractères d'une case du gabarit, du `debut` compris à la `fin`
//! non comprise. Le format est le même partout, dans la base comme dans l'interface :
//! `{ "champ": "texte", "debut": 12, "fin": 30 }`.
//!
//! `champ` est le chemin de la case dans le contenu ([`crate::gabarits`]) : `texte` pour un
//! billet, `articles.2.texte` pour le troisième article d'une gazette.
//!
//! Règles de ce fichier :
//!
//! * les positions comptent les **caractères Unicode** (ce que compte `chars()`), jamais les
//!   octets ni les unités UTF-16 du navigateur. C'est aussi ce que compte PostgreSQL, qui
//!   voile les passages abîmés (fonction SQL `voiler_passages`) ;
//! * les passages réécrits ne sont jamais reçus de l'interface : le serveur les repère
//!   lui-même, en comparant l'original et la version livrée ;
//! * les passages abîmés sont choisis par le MJ, et vérifiés ici.

use serde::{Deserialize, Serialize};
use similar::{Algorithm, DiffTag, capture_diff_slices};
use ts_rs::TS;

use crate::erreur::Erreur;
use crate::gabarits::Contenu;

/// La seule case d'un billet, et la case d'un passage enregistré sans case.
pub const CHAMP_TEXTE: &str = "texte";

/// Nombre de passages abîmés qu'un même document peut porter.
const PASSAGES_ABIMES_MAX: usize = 100;

/// Un passage d'une case du gabarit : du `debut` compris à la `fin` non comprise.
/// Les positions comptent les caractères, pas les octets.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Passage {
    /// La case du gabarit. Un passage enregistré sans case vaut `texte`.
    #[serde(default = "champ_texte")]
    pub champ: String,
    pub debut: u32,
    pub fin: u32,
}

fn champ_texte() -> String {
    CHAMP_TEXTE.to_owned()
}

impl Passage {
    fn du_texte(debut: usize, fin: usize) -> Self {
        Self {
            champ: champ_texte(),
            debut: debut as u32,
            fin: fin as u32,
        }
    }
}

/// Un mot du texte, et sa place en caractères.
struct Mot<'a> {
    lettres: &'a str,
    debut: usize,
    fin: usize,
}

/// Les mots d'un texte : tout ce qui est séparé par des espaces ou des retours à la ligne.
/// La ponctuation reste collée à son mot.
fn mots(texte: &str) -> Vec<Mot<'_>> {
    let mut mots = Vec::new();
    // Le mot en cours : son premier octet, et son premier caractère.
    let mut en_cours: Option<(usize, usize)> = None;
    let mut caracteres = 0;
    for (octet, caractere) in texte.char_indices() {
        if caractere.is_whitespace() {
            if let Some((premier_octet, debut)) = en_cours.take() {
                mots.push(Mot {
                    lettres: &texte[premier_octet..octet],
                    debut,
                    fin: caracteres,
                });
            }
        } else if en_cours.is_none() {
            en_cours = Some((octet, caracteres));
        }
        caracteres += 1;
    }
    if let Some((premier_octet, debut)) = en_cours {
        mots.push(Mot {
            lettres: &texte[premier_octet..],
            debut,
            fin: caracteres,
        });
    }
    mots
}

/// Repère les passages réécrits de tout un document, case par case. La version livrée a la
/// forme de l'original ([`Contenu::meme_forme`]) : chaque case se compare à celle qui a le
/// même chemin. Une case que l'original n'a pas est comparée à une case vide.
pub fn reperer_dans_le_contenu(original: &Contenu, livre: &Contenu) -> Vec<Passage> {
    let avant = original.textes();
    let mut passages = Vec::new();
    for (chemin, texte) in livre.textes() {
        let ancien = avant
            .iter()
            .find(|(autre, _)| *autre == chemin)
            .map_or("", |(_, ancien)| *ancien);
        for mut passage in reperer_reecritures(ancien, texte) {
            passage.champ.clone_from(&chemin);
            passages.push(passage);
        }
    }
    passages
}

/// Repère les passages réécrits d'un texte : ce qui, dans la version livrée, n'est pas de
/// l'auteur. Les passages rendus désignent la case `texte`.
///
/// Les deux textes sont comparés mot par mot. Tout mot ajouté ou remplacé dans la version
/// livrée fait partie d'un passage réécrit ; des mots voisins forment un seul passage,
/// espaces compris. Un mot simplement supprimé ne laisse rien à montrer : aucun passage.
pub fn reperer_reecritures(original: &str, livre: &str) -> Vec<Passage> {
    let avant = mots(original);
    let apres = mots(livre);
    let lettres_avant: Vec<&str> = avant.iter().map(|mot| mot.lettres).collect();
    let lettres_apres: Vec<&str> = apres.iter().map(|mot| mot.lettres).collect();

    // Les suites de mots nouveaux, par leur rang dans la version livrée.
    let mut suites: Vec<(usize, usize)> = Vec::new();
    for operation in capture_diff_slices(Algorithm::Myers, &lettres_avant, &lettres_apres) {
        let (genre, _, nouveaux) = operation.as_tag_tuple();
        if !matches!(genre, DiffTag::Insert | DiffTag::Replace) || nouveaux.is_empty() {
            continue;
        }
        match suites.last_mut() {
            // Deux suites qui se touchent n'en font qu'une.
            Some((_, fin)) if *fin == nouveaux.start => *fin = nouveaux.end,
            _ => suites.push((nouveaux.start, nouveaux.end)),
        }
    }

    suites
        .into_iter()
        .map(|(premier, suivant)| Passage::du_texte(apres[premier].debut, apres[suivant - 1].fin))
        .collect()
}

/// Vérifie les passages abîmés choisis par le MJ, et les rend rangés : dans l'ordre des
/// cases du document, puis dans l'ordre du texte. Deux passages d'une même case qui se
/// touchent ou se chevauchent n'en font qu'un.
///
/// `cases` : les cases de texte du document, chacune avec son chemin ([`Contenu::textes`]).
pub fn verifier_abimes(cases: &[(String, &str)], passages: &[Passage]) -> Result<Vec<Passage>, Erreur> {
    if passages.len() > PASSAGES_ABIMES_MAX {
        return Err(Erreur::Refus("Ce document a trop de passages abîmés."));
    }
    if passages
        .iter()
        .any(|passage| !cases.iter().any(|(chemin, _)| *chemin == passage.champ))
    {
        return Err(Erreur::Refus(
            "Un passage abîmé désigne une case que ce document n'a pas. Choisissez-le de nouveau.",
        ));
    }

    let mut reunis: Vec<Passage> = Vec::new();
    for (chemin, texte) in cases {
        let longueur = texte.chars().count() as u32;
        let mut choisis: Vec<&Passage> = passages
            .iter()
            .filter(|passage| passage.champ == *chemin)
            .collect();
        choisis.sort_by_key(|passage| (passage.debut, passage.fin));

        let mut de_la_case: Vec<Passage> = Vec::new();
        for passage in choisis {
            if passage.debut >= passage.fin || passage.fin > longueur {
                return Err(Erreur::Refus(
                    "Un passage abîmé sort du texte. Choisissez-le de nouveau.",
                ));
            }
            match de_la_case.last_mut() {
                Some(precedent) if passage.debut <= precedent.fin => {
                    precedent.fin = precedent.fin.max(passage.fin);
                }
                _ => de_la_case.push(passage.clone()),
            }
        }
        reunis.extend(de_la_case);
    }
    Ok(reunis)
}

/// Les passages rangés dans la base. Un passage mal formé ne doit pas empêcher de lire
/// une lettre : la liste est alors vide. (Pour un passage abîmé, c'est la base qui voile
/// le texte, et elle voile tout si la liste est mal formée.)
pub fn depuis_la_base(valeur: serde_json::Value) -> Vec<Passage> {
    serde_json::from_value(valeur).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn passage(debut: u32, fin: u32) -> Passage {
        Passage {
            champ: CHAMP_TEXTE.to_owned(),
            debut,
            fin,
        }
    }

    /// Ce que désigne un passage, compté en caractères comme le fait l'interface.
    fn extrait(texte: &str, passage: &Passage) -> String {
        texte
            .chars()
            .skip(passage.debut as usize)
            .take((passage.fin - passage.debut) as usize)
            .collect()
    }

    fn reecrits(original: &str, livre: &str) -> Vec<String> {
        reperer_reecritures(original, livre)
            .iter()
            .map(|passage| extrait(livre, passage))
            .collect()
    }

    #[test]
    fn un_texte_inchange_n_a_aucun_passage() {
        let texte = "Cher Bertrand,\nretrouvez-moi à la chapelle, jeudi.";
        assert_eq!(reperer_reecritures(texte, texte), vec![]);
    }

    #[test]
    fn une_phrase_modifiee_au_milieu() {
        assert_eq!(
            reecrits(
                "Retrouvez-moi à la chapelle, jeudi soir.",
                "Retrouvez-moi au vieux moulin, jeudi soir.",
            ),
            vec!["au vieux moulin,"],
        );
    }

    #[test]
    fn une_phrase_modifiee_au_debut() {
        let passages = reperer_reecritures("Cher Bertrand, venez seul.", "Mon ami, venez seul.");
        assert_eq!(passages, vec![passage(0, 8)]);
    }

    #[test]
    fn une_phrase_modifiee_a_la_fin() {
        let livre = "Venez seul, sans arme.";
        let passages = reperer_reecritures("Venez seul, jeudi.", livre);
        assert_eq!(passages, vec![passage(12, 22)]);
        assert_eq!(extrait(livre, &passages[0]), "sans arme.");
    }

    #[test]
    fn un_mot_ajoute_est_un_passage() {
        assert_eq!(reecrits("Venez jeudi.", "Venez seul jeudi."), vec!["seul"]);
    }

    #[test]
    fn un_mot_supprime_ne_laisse_rien_a_montrer() {
        assert_eq!(reperer_reecritures("Venez seul jeudi.", "Venez jeudi."), vec![]);
    }

    #[test]
    fn des_changements_eloignes_font_plusieurs_passages() {
        assert_eq!(
            reecrits(
                "Les comptes du duché ne tombent pas juste.",
                "Les registres du duché ne tombent pas faux.",
            ),
            vec!["registres", "faux."],
        );
    }

    #[test]
    fn les_positions_comptent_les_caracteres_pas_les_octets() {
        // « é », « à » et « 🕯 » prennent plusieurs octets, et « 🕯 » deux unités UTF-16 :
        // chacun ne compte pourtant que pour un caractère.
        let livre = "Évêché 🕯 à minuit, près du gué.";
        let passages = reperer_reecritures("Évêché 🕯 à midi, près du gué.", livre);
        assert_eq!(passages, vec![passage(11, 18)]);
        assert_eq!(extrait(livre, &passages[0]), "minuit,");
    }

    #[test]
    fn les_retours_a_la_ligne_separent_les_mots() {
        let livre = "Cher ami,\nvenez demain.\nAlix";
        let passages = reperer_reecritures("Cher ami,\nvenez jeudi.\nAlix", livre);
        assert_eq!(passages, vec![passage(16, 23)]);
        assert_eq!(extrait(livre, &passages[0]), "demain.");
    }

    #[test]
    fn un_texte_entierement_nouveau_est_un_seul_passage() {
        let livre = "Tout est faux.";
        assert_eq!(reperer_reecritures("Rien à voir ici", livre), vec![passage(0, 14)]);
    }

    /// Les cases d'un billet : son seul texte.
    fn billet(texte: &str) -> Vec<(String, &str)> {
        vec![(CHAMP_TEXTE.to_owned(), texte)]
    }

    #[test]
    fn les_passages_abimes_sont_ranges_et_reunis() {
        let rendus = verifier_abimes(
            &billet("Les registres ont disparu."),
            &[passage(14, 17), passage(0, 3), passage(16, 25)],
        );
        assert_eq!(rendus.ok(), Some(vec![passage(0, 3), passage(14, 25)]));
    }

    #[test]
    fn un_passage_abime_reste_dans_le_texte() {
        // Dix caractères, mais plus d'octets : la limite est celle des caractères.
        let cases = billet("été 🕯 gué.");
        assert!(verifier_abimes(&cases, &[passage(4, 10)]).is_ok());
        assert!(verifier_abimes(&cases, &[passage(4, 11)]).is_err());
        assert!(verifier_abimes(&cases, &[passage(5, 5)]).is_err());
    }

    fn rapport(rubriques: &[(&str, &str)]) -> Contenu {
        Contenu::Rapport(crate::gabarits::Rapport {
            titre: "Rapport".into(),
            auteur: String::new(),
            rubriques: rubriques
                .iter()
                .map(|(titre, texte)| crate::gabarits::Rubrique {
                    titre: (*titre).into(),
                    texte: (*texte).into(),
                })
                .collect(),
        })
    }

    fn dans(champ: &str, debut: u32, fin: u32) -> Passage {
        Passage { champ: champ.to_owned(), debut, fin }
    }

    #[test]
    fn chaque_case_d_un_document_a_ses_passages_reecrits() {
        let original = rapport(&[("Les comptes", "Tout est en ordre."), ("Les hommes", "Rien à dire.")]);
        let livre = rapport(&[("Les comptes", "Tout est en désordre."), ("Les traîtres", "Rien à dire.")]);
        assert_eq!(
            reperer_dans_le_contenu(&original, &livre),
            vec![dans("rubriques.0.texte", 12, 21), dans("rubriques.1.titre", 4, 12)],
        );
        assert_eq!(reperer_dans_le_contenu(&original, &original), vec![]);
    }

    #[test]
    fn les_passages_abimes_se_rangent_case_par_case() {
        let document = rapport(&[("Un", "Premier texte."), ("Deux", "Second texte.")]);
        let rendus = verifier_abimes(
            &document.textes(),
            &[
                dans("rubriques.1.texte", 0, 6),
                dans("rubriques.0.texte", 8, 13),
                dans("rubriques.0.texte", 0, 7),
                // Il touche le précédent, mais dans une autre case : ils restent deux.
                dans("rubriques.1.titre", 0, 4),
            ],
        );
        assert_eq!(
            rendus.ok(),
            Some(vec![
                dans("rubriques.0.texte", 0, 7),
                dans("rubriques.0.texte", 8, 13),
                dans("rubriques.1.titre", 0, 4),
                dans("rubriques.1.texte", 0, 6),
            ]),
        );
    }

    #[test]
    fn un_passage_abime_designe_une_case_du_document() {
        let document = rapport(&[("Un", "Premier texte.")]);
        assert!(verifier_abimes(&document.textes(), &[dans("rubriques.1.texte", 0, 3)]).is_err());
        assert!(verifier_abimes(&document.textes(), &[dans("rubriques", 0, 3)]).is_err());
        assert!(verifier_abimes(&document.textes(), &[dans("texte", 0, 3)]).is_err());
    }

    #[test]
    fn un_passage_sans_case_vaut_le_texte() {
        let lu = depuis_la_base(serde_json::json!([{ "debut": 0, "fin": 7 }]));
        assert_eq!(lu, vec![passage(0, 7)]);
    }
}
