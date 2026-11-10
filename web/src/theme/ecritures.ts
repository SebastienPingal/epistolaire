/**
 * Les polices manuscrites fournies avec le site.
 *
 * Chaque clé correspond à la colonne `police` de la table `ecritures`.
 * Ajouter une police : l'installer (`@fontsource/…`), l'importer ici, l'ajouter à la liste,
 * puis l'ajouter à la base par une migration.
 */
import '@fontsource/caveat/latin-400.css';
import '@fontsource/cedarville-cursive/latin-400.css';
import '@fontsource/dawning-of-a-new-day/latin-400.css';
import '@fontsource/gloria-hallelujah/latin-400.css';
import '@fontsource/homemade-apple/latin-400.css';
import '@fontsource/indie-flower/latin-400.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/la-belle-aurore/latin-400.css';
import '@fontsource/marck-script/latin-400.css';
import '@fontsource/nothing-you-could-do/latin-400.css';
import '@fontsource/parisienne/latin-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/reenie-beanie/latin-400.css';
import '@fontsource/shadows-into-light/latin-400.css';

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
};

/** Une police inconnue du site s'affiche avec la police de texte courante. */
const SECOURS: Police = { famille: 'var(--police-texte)', echelle: 1 };

export function policeDe(cle: string | null | undefined): Police {
  return (cle && polices[cle]) || SECOURS;
}

/** Une phrase qui montre les lettres, les accents et les liaisons d'une écriture. */
export const PHRASE_TEMOIN = 'Portez ce vieux whisky au juge blond qui fume, et gardez-vous d’être vu.';
