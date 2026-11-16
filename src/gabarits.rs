//! Les gabarits : les cases de chaque sorte de document, et ce qu'on y écrit.
//!
//! Un gabarit est fixe : il a ses cases, dont certaines se répètent (les articles d'une
//! gazette, les rubriques d'un rapport). Dans la base, le nom du gabarit est dans la colonne
//! `plis.gabarit`, et ses cases dans le JSON de `contenu` (celui du pli pour l'original,
//! celui de l'exemplaire pour la version livrée). Avec l'interface, les deux voyagent
//! ensemble : `{ "gabarit": "billet", "texte": "…" }`.
//!
//! Règles de ce fichier :
//!
//! * un contenu rangé avant l'étape 11 reste lisible tel quel : un billet est toujours
//!   `{ "texte": … }`, et une case absente vaut une case vide ;
//! * une case de texte se désigne par son chemin : `texte`, `articles.2.texte`,
//!   `rubriques.0.titre`. C'est ce chemin que portent les passages réécrits ou abîmés
//!   ([`crate::passages`]), et c'est lui que suit la fonction SQL `voiler_passages` ;
//! * la signature, le sceau et l'écriture ne sont pas des cases : ils restent dans les
//!   colonnes communes de `plis` et `exemplaires`.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use crate::erreur::Erreur;
use crate::modele::Gabarit;

/// La longueur d'un long texte : le MJ dépasse celle d'un billet de joueur, mais pas sans fin.
pub const LONGUEUR_MAX: usize = 20_000;
/// La longueur d'une case courte : un titre, un lieu, un nom.
const LONGUEUR_COURTE: usize = 300;
/// Le nombre d'articles, de rubriques ou de lettres de lecteurs d'un même document.
const REPETITIONS_MAX: usize = 40;
/// La longueur de tout un document, toutes cases comprises.
const LONGUEUR_TOTALE: usize = 80_000;

// ---------------------------------------------------------------------------
// Les six gabarits
// ---------------------------------------------------------------------------

/// Un billet : le gabarit des joueurs. Signature et sceau.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Billet {
    pub texte: String,
}

/// Une lettre longue. Signature et sceau.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct LettreLongue {
    /// « Au château, le 3e jour du 2e mois ». Facultatif.
    pub lieu_et_date: String,
    pub texte: String,
}

/// Une gazette : imprimée. L'étape 12 en fera des numéros.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct GazetteContenu {
    pub titre: String,
    pub numero: String,
    pub date: String,
    pub articles: Vec<Article>,
    /// Le courrier des lecteurs.
    pub courrier: Vec<LettreLecteur>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Article {
    pub titre: String,
    pub texte: String,
}

/// Une lettre publiée dans la gazette : recopiée, sans écriture ni sceau.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct LettreLecteur {
    pub texte: String,
    /// Un simple nom. Vide : anonyme.
    pub signature: Option<String>,
}

/// Un acte officiel. Signature et sceau.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Acte {
    /// Qui parle : « La Chancellerie du duché ».
    pub autorite: String,
    pub objet: String,
    pub texte: String,
    /// « Fait pour valoir ce que de droit. »
    pub formule_finale: String,
}

/// Un rapport : imprimé.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Rapport {
    pub titre: String,
    /// Le nom imprimé de celui qui rapporte. Ce n'est pas une signature.
    pub auteur: String,
    pub rubriques: Vec<Rubrique>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Rubrique {
    pub titre: String,
    pub texte: String,
}

/// Une carte ou une illustration : une image, et sa légende imprimée.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(default)]
#[ts(export)]
pub struct Carte {
    /// L'identifiant de l'image (table `images`).
    pub image: Uuid,
    pub titre: String,
    pub legende: String,
}

/// Le contenu d'un document : les cases de son gabarit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "gabarit", rename_all = "snake_case")]
#[ts(export)]
pub enum Contenu {
    Billet(Billet),
    LettreLongue(LettreLongue),
    Gazette(GazetteContenu),
    Acte(Acte),
    Rapport(Rapport),
    Carte(Carte),
}

impl Gabarit {
    /// Écrit à la main, dans l'écriture de l'expéditeur. Les autres sont imprimés.
    pub fn est_manuscrit(self) -> bool {
        matches!(self, Self::Billet | Self::LettreLongue | Self::Acte)
    }

    /// Porte une signature sous le texte. Ce sont les gabarits écrits à la main.
    pub fn se_signe(self) -> bool {
        self.est_manuscrit()
    }
}

// ---------------------------------------------------------------------------
// Lire et ranger
// ---------------------------------------------------------------------------

impl Contenu {
    pub fn billet(texte: impl Into<String>) -> Self {
        Self::Billet(Billet {
            texte: texte.into(),
        })
    }

    pub fn gabarit(&self) -> Gabarit {
        match self {
            Self::Billet(_) => Gabarit::Billet,
            Self::LettreLongue(_) => Gabarit::LettreLongue,
            Self::Gazette(_) => Gabarit::Gazette,
            Self::Acte(_) => Gabarit::Acte,
            Self::Rapport(_) => Gabarit::Rapport,
            Self::Carte(_) => Gabarit::Carte,
        }
    }

    /// Un contenu aux cases vides.
    fn vide(gabarit: Gabarit) -> Self {
        match gabarit {
            Gabarit::Billet => Self::Billet(Billet::default()),
            Gabarit::LettreLongue => Self::LettreLongue(LettreLongue::default()),
            Gabarit::Gazette => Self::Gazette(GazetteContenu::default()),
            Gabarit::Acte => Self::Acte(Acte::default()),
            Gabarit::Rapport => Self::Rapport(Rapport::default()),
            Gabarit::Carte => Self::Carte(Carte::default()),
        }
    }

    /// Le contenu rangé dans la base : le gabarit du pli, et le JSON de ses cases.
    ///
    /// Un contenu mal formé ne doit pas empêcher de lire une Réception : ses cases sont
    /// alors vides. Une case absente vaut une case vide, ce qui garde lisibles les billets
    /// d'avant l'étape 11.
    pub fn depuis_la_base(gabarit: Gabarit, cases: Value) -> Self {
        let lu = match gabarit {
            Gabarit::Billet => serde_json::from_value(cases).map(Self::Billet),
            Gabarit::LettreLongue => serde_json::from_value(cases).map(Self::LettreLongue),
            Gabarit::Gazette => serde_json::from_value(cases).map(Self::Gazette),
            Gabarit::Acte => serde_json::from_value(cases).map(Self::Acte),
            Gabarit::Rapport => serde_json::from_value(cases).map(Self::Rapport),
            Gabarit::Carte => serde_json::from_value(cases).map(Self::Carte),
        };
        lu.unwrap_or_else(|_| Self::vide(gabarit))
    }

    /// Les cases, telles qu'elles se rangent dans la colonne `contenu` : sans le nom du
    /// gabarit, qui a sa propre colonne.
    pub fn cases(&self) -> Value {
        let cases = match self {
            Self::Billet(billet) => serde_json::to_value(billet),
            Self::LettreLongue(lettre) => serde_json::to_value(lettre),
            Self::Gazette(gazette) => serde_json::to_value(gazette),
            Self::Acte(acte) => serde_json::to_value(acte),
            Self::Rapport(rapport) => serde_json::to_value(rapport),
            Self::Carte(carte) => serde_json::to_value(carte),
        };
        // Ces structures ne contiennent que des textes, des listes et un identifiant :
        // leur mise en JSON ne peut pas échouer.
        cases.unwrap_or(Value::Null)
    }

    /// Toutes les cases de texte, dans l'ordre où on les lit, chacune avec son chemin.
    pub fn textes(&self) -> Vec<(String, &str)> {
        fn case<'a>(cases: &mut Vec<(String, &'a str)>, chemin: impl Into<String>, texte: &'a str) {
            cases.push((chemin.into(), texte));
        }
        let mut cases = Vec::new();
        match self {
            Self::Billet(billet) => case(&mut cases, "texte", &billet.texte),
            Self::LettreLongue(lettre) => {
                case(&mut cases, "lieu_et_date", &lettre.lieu_et_date);
                case(&mut cases, "texte", &lettre.texte);
            }
            Self::Gazette(gazette) => {
                case(&mut cases, "titre", &gazette.titre);
                case(&mut cases, "numero", &gazette.numero);
                case(&mut cases, "date", &gazette.date);
                for (rang, article) in gazette.articles.iter().enumerate() {
                    case(&mut cases, format!("articles.{rang}.titre"), &article.titre);
                    case(&mut cases, format!("articles.{rang}.texte"), &article.texte);
                }
                for (rang, lettre) in gazette.courrier.iter().enumerate() {
                    case(&mut cases, format!("courrier.{rang}.texte"), &lettre.texte);
                    if let Some(signature) = &lettre.signature {
                        case(&mut cases, format!("courrier.{rang}.signature"), signature);
                    }
                }
            }
            Self::Acte(acte) => {
                case(&mut cases, "autorite", &acte.autorite);
                case(&mut cases, "objet", &acte.objet);
                case(&mut cases, "texte", &acte.texte);
                case(&mut cases, "formule_finale", &acte.formule_finale);
            }
            Self::Rapport(rapport) => {
                case(&mut cases, "titre", &rapport.titre);
                case(&mut cases, "auteur", &rapport.auteur);
                for (rang, rubrique) in rapport.rubriques.iter().enumerate() {
                    case(&mut cases, format!("rubriques.{rang}.titre"), &rubrique.titre);
                    case(&mut cases, format!("rubriques.{rang}.texte"), &rubrique.texte);
                }
            }
            Self::Carte(carte) => {
                case(&mut cases, "titre", &carte.titre);
                case(&mut cases, "legende", &carte.legende);
            }
        }
        cases
    }

    /// Les images que ce contenu cite.
    pub fn images(&self) -> Vec<Uuid> {
        match self {
            Self::Carte(carte) => vec![carte.image],
            _ => Vec::new(),
        }
    }

    /// Les premiers mots, pour reconnaître un document dans une liste : son titre s'il en a
    /// un, sinon le début de son texte.
    pub fn apercu(&self, longueur: usize) -> String {
        let source = match self {
            Self::Billet(billet) => &billet.texte,
            Self::LettreLongue(lettre) => &lettre.texte,
            Self::Gazette(gazette) => &gazette.titre,
            Self::Acte(acte) if acte.objet.trim().is_empty() => &acte.texte,
            Self::Acte(acte) => &acte.objet,
            Self::Rapport(rapport) => &rapport.titre,
            Self::Carte(carte) if carte.titre.trim().is_empty() => &carte.legende,
            Self::Carte(carte) => &carte.titre,
        };
        source.chars().take(longueur).collect()
    }

    /// Le même gabarit, avec autant d'articles, de rubriques et de lettres de lecteurs.
    /// Une version livrée garde la forme de l'original : c'est ce qui permet de comparer
    /// les deux case par case.
    pub fn meme_forme(&self, autre: &Self) -> bool {
        match (self, autre) {
            (Self::Gazette(a), Self::Gazette(b)) => {
                a.articles.len() == b.articles.len() && a.courrier.len() == b.courrier.len()
            }
            (Self::Rapport(a), Self::Rapport(b)) => a.rubriques.len() == b.rubriques.len(),
            _ => self.gabarit() == autre.gabarit(),
        }
    }

    /// Le même contenu, sans les espaces autour de chaque case. À faire avant de ranger
    /// un original ; jamais sur une version livrée, dont les passages comptent les caractères.
    pub fn nettoye(mut self) -> Self {
        fn net(texte: &mut String) {
            let propre = texte.trim();
            if propre.len() != texte.len() {
                *texte = propre.to_owned();
            }
        }
        match &mut self {
            Self::Billet(billet) => net(&mut billet.texte),
            Self::LettreLongue(lettre) => {
                net(&mut lettre.lieu_et_date);
                net(&mut lettre.texte);
            }
            Self::Gazette(gazette) => {
                net(&mut gazette.titre);
                net(&mut gazette.numero);
                net(&mut gazette.date);
                for article in &mut gazette.articles {
                    net(&mut article.titre);
                    net(&mut article.texte);
                }
                for lettre in &mut gazette.courrier {
                    net(&mut lettre.texte);
                    // Une signature vide, c'est une lettre anonyme.
                    lettre.signature = lettre
                        .signature
                        .take()
                        .map(|signature| signature.trim().to_owned())
                        .filter(|signature| !signature.is_empty());
                }
            }
            Self::Acte(acte) => {
                net(&mut acte.autorite);
                net(&mut acte.objet);
                net(&mut acte.texte);
                net(&mut acte.formule_finale);
            }
            Self::Rapport(rapport) => {
                net(&mut rapport.titre);
                net(&mut rapport.auteur);
                for rubrique in &mut rapport.rubriques {
                    net(&mut rubrique.titre);
                    net(&mut rubrique.texte);
                }
            }
            Self::Carte(carte) => {
                net(&mut carte.titre);
                net(&mut carte.legende);
            }
        }
        self
    }

    /// Vérifie qu'un contenu peut partir : ses cases obligatoires sont remplies, et rien
    /// n'est démesuré. Ne modifie rien. L'existence de l'image d'une carte se vérifie à
    /// part, dans la base.
    pub fn valider(&self) -> Result<(), Erreur> {
        match self {
            Self::Billet(billet) => {
                exiger(&billet.texte, "Ce billet est vide.")?;
            }
            Self::LettreLongue(lettre) => {
                exiger(&lettre.texte, "Cette lettre est vide.")?;
            }
            Self::Gazette(gazette) => {
                exiger(&gazette.titre, "Une gazette porte un titre.")?;
                if gazette.articles.is_empty() {
                    return Err(Erreur::Refus("Une gazette a au moins un article."));
                }
                if gazette.articles.len() > REPETITIONS_MAX
                    || gazette.courrier.len() > REPETITIONS_MAX
                {
                    return Err(Erreur::Refus("Cette gazette a trop d'articles ou de lettres."));
                }
                for article in &gazette.articles {
                    exiger(&article.texte, "Un article de la gazette est vide.")?;
                }
                for lettre in &gazette.courrier {
                    exiger(&lettre.texte, "Une lettre du courrier des lecteurs est vide.")?;
                }
            }
            Self::Acte(acte) => {
                exiger(&acte.texte, "Cet acte est vide.")?;
            }
            Self::Rapport(rapport) => {
                exiger(&rapport.titre, "Un rapport porte un titre.")?;
                if rapport.rubriques.is_empty() {
                    return Err(Erreur::Refus("Un rapport a au moins une rubrique."));
                }
                if rapport.rubriques.len() > REPETITIONS_MAX {
                    return Err(Erreur::Refus("Ce rapport a trop de rubriques."));
                }
                for rubrique in &rapport.rubriques {
                    exiger(&rubrique.texte, "Une rubrique du rapport est vide.")?;
                }
            }
            Self::Carte(carte) => {
                if carte.image.is_nil() {
                    return Err(Erreur::Refus("Choisissez l'image de cette carte."));
                }
            }
        }

        let mut total = 0;
        for (chemin, texte) in self.textes() {
            let longueur = texte.chars().count();
            let limite = if est_un_long_texte(&chemin) {
                LONGUEUR_MAX
            } else {
                LONGUEUR_COURTE
            };
            if longueur > limite {
                return Err(Erreur::Refus(if limite == LONGUEUR_MAX {
                    "Ce texte est bien trop long."
                } else {
                    "Un titre, un lieu ou un nom est trop long."
                }));
            }
            total += longueur;
        }
        if total > LONGUEUR_TOTALE {
            return Err(Erreur::Refus("Ce document est bien trop long."));
        }
        Ok(())
    }
}

fn exiger(texte: &str, refus: &'static str) -> Result<(), Erreur> {
    if texte.trim().is_empty() {
        return Err(Erreur::Refus(refus));
    }
    Ok(())
}

/// Les cases qui portent un long texte ; toutes les autres sont des cases courtes.
fn est_un_long_texte(chemin: &str) -> bool {
    matches!(
        chemin.rsplit('.').next(),
        Some("texte" | "legende" | "formule_finale")
    )
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn un_billet_d_avant_l_etape_11_reste_lisible() {
        let lu = Contenu::depuis_la_base(Gabarit::Billet, json!({ "texte": "Cher ami," }));
        assert_eq!(lu, Contenu::billet("Cher ami,"));
        // Et il se range exactement comme avant.
        assert_eq!(lu.cases(), json!({ "texte": "Cher ami," }));
    }

    #[test]
    fn une_case_absente_vaut_une_case_vide() {
        assert_eq!(
            Contenu::depuis_la_base(Gabarit::Billet, json!({})),
            Contenu::billet(""),
        );
        let lettre = Contenu::depuis_la_base(Gabarit::LettreLongue, json!({ "texte": "Bonjour" }));
        assert_eq!(
            lettre,
            Contenu::LettreLongue(LettreLongue {
                lieu_et_date: String::new(),
                texte: "Bonjour".into(),
            }),
        );
    }

    #[test]
    fn un_contenu_mal_forme_se_lit_vide() {
        let lu = Contenu::depuis_la_base(Gabarit::Rapport, json!({ "rubriques": "pas une liste" }));
        assert_eq!(lu, Contenu::Rapport(Rapport::default()));
        assert_eq!(
            Contenu::depuis_la_base(Gabarit::Billet, json!("un texte nu")),
            Contenu::billet(""),
        );
    }

    #[test]
    fn avec_l_interface_le_gabarit_voyage_avec_les_cases() {
        let contenu = Contenu::Acte(Acte {
            autorite: "La Chancellerie".into(),
            objet: "Nomination".into(),
            texte: "Il est décidé…".into(),
            formule_finale: String::new(),
        });
        let json = serde_json::to_value(&contenu).unwrap_or_default();
        assert_eq!(json["gabarit"], "acte");
        assert_eq!(json["autorite"], "La Chancellerie");
        assert_eq!(serde_json::from_value::<Contenu>(json).ok(), Some(contenu.clone()));
        // Dans la base, le nom du gabarit n'est pas répété parmi les cases.
        assert!(contenu.cases().get("gabarit").is_none());
    }

    #[test]
    fn les_cases_de_texte_ont_leur_chemin() {
        let gazette = Contenu::Gazette(GazetteContenu {
            titre: "La Gazette".into(),
            numero: "12".into(),
            date: "3e jour".into(),
            articles: vec![
                Article { titre: "Un".into(), texte: "Premier".into() },
                Article { titre: "Deux".into(), texte: "Second".into() },
            ],
            courrier: vec![LettreLecteur { texte: "Bravo".into(), signature: None }],
        });
        let chemins: Vec<String> = gazette.textes().into_iter().map(|(chemin, _)| chemin).collect();
        assert_eq!(
            chemins,
            [
                "titre",
                "numero",
                "date",
                "articles.0.titre",
                "articles.0.texte",
                "articles.1.titre",
                "articles.1.texte",
                "courrier.0.texte",
            ],
        );
        // Chaque chemin désigne bien la case, dans le JSON rangé en base.
        let cases = gazette.cases();
        assert_eq!(cases["articles"][1]["texte"], "Second");
    }

    #[test]
    fn les_cases_obligatoires() {
        assert!(Contenu::billet("  ").valider().is_err());
        assert!(Contenu::billet("Bonjour").valider().is_ok());
        assert!(Contenu::Rapport(Rapport { titre: "Titre".into(), ..Rapport::default() })
            .valider()
            .is_err());
        assert!(Contenu::Carte(Carte::default()).valider().is_err());
        assert!(Contenu::Carte(Carte { image: Uuid::from_u128(1), ..Carte::default() })
            .valider()
            .is_ok());
    }

    #[test]
    fn nettoyer_retire_les_espaces_et_les_signatures_vides() {
        let propre = Contenu::Gazette(GazetteContenu {
            titre: "  La Gazette ".into(),
            articles: vec![Article { titre: String::new(), texte: " Texte\n".into() }],
            courrier: vec![LettreLecteur { texte: "Bravo".into(), signature: Some("  ".into()) }],
            ..GazetteContenu::default()
        })
        .nettoye();
        let Contenu::Gazette(gazette) = propre else { panic!("ce n'est plus une gazette") };
        assert_eq!(gazette.titre, "La Gazette");
        assert_eq!(gazette.articles[0].texte, "Texte");
        assert_eq!(gazette.courrier[0].signature, None);
    }

    #[test]
    fn la_forme_compte_les_cases_repetees() {
        let rapport = |rubriques: usize| {
            Contenu::Rapport(Rapport {
                rubriques: vec![Rubrique::default(); rubriques],
                ..Rapport::default()
            })
        };
        assert!(rapport(2).meme_forme(&rapport(2)));
        assert!(!rapport(2).meme_forme(&rapport(3)));
        assert!(!rapport(2).meme_forme(&Contenu::billet("")));
    }
}
