/**
 * Les polices manuscrites fournies avec le site.
 *
 * Chaque clé correspond à la colonne `police` de la table `ecritures`.
 * Ajouter une police : l'installer (`@fontsource/…`), l'importer ici, l'ajouter à la liste,
 * puis l'ajouter à la base par une migration.
 */
import '@fontsource/alex-brush/latin-400.css';
import '@fontsource/allura/latin-400.css';
import '@fontsource/annie-use-your-telescope/latin-400.css';
import '@fontsource/architects-daughter/latin-400.css';
import '@fontsource/bad-script/latin-400.css';
import '@fontsource/beth-ellen/latin-400.css';
import '@fontsource/calligraffitti/latin-400.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/caveat-brush/latin-400.css';
import '@fontsource/cedarville-cursive/latin-400.css';
import '@fontsource/courgette/latin-400.css';
import '@fontsource/covered-by-your-grace/latin-400.css';
import '@fontsource/dancing-script/latin-400.css';
import '@fontsource/dawning-of-a-new-day/latin-400.css';
import '@fontsource/ephesis/latin-400.css';
import '@fontsource/euphoria-script/latin-400.css';
import '@fontsource/gloria-hallelujah/latin-400.css';
import '@fontsource/grape-nuts/latin-400.css';
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/handlee/latin-400.css';
import '@fontsource/homemade-apple/latin-400.css';
import '@fontsource/indie-flower/latin-400.css';
import '@fontsource/italianno/latin-400.css';
import '@fontsource/just-another-hand/latin-400.css';
import '@fontsource/just-me-again-down-here/latin-400.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/la-belle-aurore/latin-400.css';
import '@fontsource/loved-by-the-king/latin-400.css';
import '@fontsource/marck-script/latin-400.css';
import '@fontsource/mea-culpa/latin-400.css';
import '@fontsource/meddon/latin-400.css';
import '@fontsource/mr-de-haviland/latin-400.css';
import '@fontsource/mrs-saint-delafield/latin-400.css';
import '@fontsource/mynerve/latin-400.css';
import '@fontsource/neucha/latin-400.css';
import '@fontsource/nothing-you-could-do/latin-400.css';
import '@fontsource/over-the-rainbow/latin-400.css';
import '@fontsource/parisienne/latin-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/petit-formal-script/latin-400.css';
import '@fontsource/pinyon-script/latin-400.css';
import '@fontsource/reenie-beanie/latin-400.css';
import '@fontsource/rouge-script/latin-400.css';
import '@fontsource/sacramento/latin-400.css';
import '@fontsource/satisfy/latin-400.css';
import '@fontsource/schoolbell/latin-400.css';
import '@fontsource/shadows-into-light/latin-400.css';
import '@fontsource/sue-ellen-francisco/latin-400.css';
import '@fontsource/the-girl-next-door/latin-400.css';
import '@fontsource/waiting-for-the-sunrise/latin-400.css';
import '@fontsource/zeyada/latin-400.css';

type Police = {
  famille: string;
  /**
   * Les polices manuscrites n'ont pas toutes le même œil : ce facteur ramène chacune
   * à une taille de lecture comparable.
   */
  echelle: number;
};

const polices: Record<string, Police> = {
  caveat: { famille: "'Caveat'", echelle: 1.3 },
  kalam: { famille: "'Kalam'", echelle: 1.05 },
  'patrick-hand': { famille: "'Patrick Hand'", echelle: 1.15 },
  'indie-flower': { famille: "'Indie Flower'", echelle: 1.1 },
  'shadows-into-light': { famille: "'Shadows Into Light'", echelle: 1.15 },
  'gloria-hallelujah': { famille: "'Gloria Hallelujah'", echelle: 0.9 },
  'reenie-beanie': { famille: "'Reenie Beanie'", echelle: 1.45 },
  'nothing-you-could-do': { famille: "'Nothing You Could Do'", echelle: 1.05 },
  'homemade-apple': { famille: "'Homemade Apple'", echelle: 0.85 },
  'la-belle-aurore': { famille: "'La Belle Aurore'", echelle: 1.1 },
  'cedarville-cursive': { famille: "'Cedarville Cursive'", echelle: 1.0 },
  'dawning-of-a-new-day': { famille: "'Dawning of a New Day'", echelle: 1.25 },
  'marck-script': { famille: "'Marck Script'", echelle: 1.15 },
  parisienne: { famille: "'Parisienne'", echelle: 1.2 },

  // Ajoutées ensuite (migration 0005).
  'dancing-script': { famille: "'Dancing Script'", echelle: 1.3 },
  satisfy: { famille: "'Satisfy'", echelle: 1.2 },
  'great-vibes': { famille: "'Great Vibes'", echelle: 1.45 },
  allura: { famille: "'Allura'", echelle: 1.35 },
  'alex-brush': { famille: "'Alex Brush'", echelle: 1.4 },
  'pinyon-script': { famille: "'Pinyon Script'", echelle: 1.3 },
  italianno: { famille: "'Italianno'", echelle: 1.6 },
  'petit-formal-script': { famille: "'Petit Formal Script'", echelle: 0.9 },
  'rouge-script': { famille: "'Rouge Script'", echelle: 1.5 },
  sacramento: { famille: "'Sacramento'", echelle: 1.6 },
  'euphoria-script': { famille: "'Euphoria Script'", echelle: 1.35 },
  'mr-de-haviland': { famille: "'Mr De Haviland'", echelle: 1.75 },
  'mrs-saint-delafield': { famille: "'Mrs Saint Delafield'", echelle: 1.7 },
  meddon: { famille: "'Meddon'", echelle: 0.9 },
  'mea-culpa': { famille: "'Mea Culpa'", echelle: 1.55 },
  ephesis: { famille: "'Ephesis'", echelle: 1.55 },
  courgette: { famille: "'Courgette'", echelle: 1.0 },
  'bad-script': { famille: "'Bad Script'", echelle: 1.1 },
  zeyada: { famille: "'Zeyada'", echelle: 1.3 },
  'over-the-rainbow': { famille: "'Over the Rainbow'", echelle: 1.0 },
  'just-another-hand': { famille: "'Just Another Hand'", echelle: 1.45 },
  'covered-by-your-grace': { famille: "'Covered By Your Grace'", echelle: 1.1 },
  'architects-daughter': { famille: "'Architects Daughter'", echelle: 1.0 },
  schoolbell: { famille: "'Schoolbell'", echelle: 1.1 },
  'sue-ellen-francisco': { famille: "'Sue Ellen Francisco'", echelle: 1.35 },
  'waiting-for-the-sunrise': { famille: "'Waiting for the Sunrise'", echelle: 1.2 },
  mynerve: { famille: "'Mynerve'", echelle: 1.1 },
  'annie-use-your-telescope': { famille: "'Annie Use Your Telescope'", echelle: 1.25 },
  'the-girl-next-door': { famille: "'The Girl Next Door'", echelle: 1.05 },
  'loved-by-the-king': { famille: "'Loved by the King'", echelle: 1.2 },
  calligraffitti: { famille: "'Calligraffitti'", echelle: 1.1 },
  'just-me-again-down-here': { famille: "'Just Me Again Down Here'", echelle: 1.45 },
  'grape-nuts': { famille: "'Grape Nuts'", echelle: 1.25 },
  'beth-ellen': { famille: "'Beth Ellen'", echelle: 0.85 },
  'caveat-brush': { famille: "'Caveat Brush'", echelle: 1.25 },
  handlee: { famille: "'Handlee'", echelle: 1.1 },
  neucha: { famille: "'Neucha'", echelle: 1.15 },
};

/** Une police inconnue du site s'affiche avec la police de texte courante. */
const SECOURS: Police = { famille: 'var(--police-texte)', echelle: 1 };

export function policeDe(cle: string | null | undefined): Police {
  return (cle && polices[cle]) || SECOURS;
}

/** Une phrase qui montre les lettres, les accents et les liaisons d'une écriture. */
export const PHRASE_TEMOIN = 'Portez ce vieux whisky au juge blond qui fume, et gardez-vous d’être vu.';
