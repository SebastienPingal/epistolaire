/**
 * Les passages d'un texte, côté navigateur : réécrits ou abîmés.
 *
 * Le serveur compte les positions en caractères Unicode ; un champ de texte du navigateur
 * les compte en unités UTF-16, où un émoji en vaut deux. Tout ce qui passe la frontière
 * est donc converti ici, et le reste de l'interface ne manie que des caractères.
 *
 * Le repérage des passages réécrits fait ici n'est qu'un aperçu pendant la frappe :
 * celui qui compte est celui du serveur, à l'enregistrement.
 */
import { diffArrays } from 'diff';

import type { Passage } from '@/types/Passage';

/** La seule case d'un billet. */
export const CHAMP_TEXTE = 'texte';

/** Le caractère que le serveur met à la place de chaque caractère abîmé. */
const VOILE = '·';

/** Une position donnée par un champ de texte (unités UTF-16), comptée en caractères. */
export function enCaracteres(texte: string, position: number): number {
  return Array.from(texte.slice(0, position)).length;
}

/** Ce que désigne un passage dans un texte. */
export function extrait(texte: string, passage: Passage): string {
  return Array.from(texte).slice(passage.debut, passage.fin).join('');
}

type Mot = { lettres: string; debut: number; fin: number };

/** Les mots d'un texte, séparés par des espaces ou des retours à la ligne, comme le serveur. */
function mots(texte: string): Mot[] {
  const resultat: Mot[] = [];
  let enCours: { lettres: string; debut: number } | null = null;
  let position = 0;
  for (const caractere of texte) {
    if (/\s/u.test(caractere)) {
      if (enCours) resultat.push({ ...enCours, fin: position });
      enCours = null;
    } else if (enCours) {
      enCours.lettres += caractere;
    } else {
      enCours = { lettres: caractere, debut: position };
    }
    position += 1;
  }
  if (enCours) resultat.push({ ...enCours, fin: position });
  return resultat;
}

/**
 * Les passages réécrits, repérés dans le navigateur : tout mot ajouté ou remplacé dans la
 * version livrée. Des mots voisins forment un seul passage ; un mot supprimé ne laisse rien.
 */
export function reecrituresLocales(original: string, livre: string): Passage[] {
  const apres = mots(livre);
  const parties = diffArrays(
    mots(original).map((mot) => mot.lettres),
    apres.map((mot) => mot.lettres),
  );

  const suites: [number, number][] = [];
  let rang = 0;
  for (const partie of parties) {
    if (partie.removed) continue;
    const suivant = rang + partie.value.length;
    if (partie.added && suivant > rang) {
      const derniere = suites[suites.length - 1];
      if (derniere && derniere[1] === rang) derniere[1] = suivant;
      else suites.push([rang, suivant]);
    }
    rang = suivant;
  }
  return suites.map(([premier, suivant]) => ({
    champ: CHAMP_TEXTE,
    debut: apres[premier].debut,
    fin: apres[suivant - 1].fin,
  }));
}

/** Range des passages dans l'ordre du texte, et réunit ceux qui se touchent. */
export function reunir(passages: Passage[]): Passage[] {
  const tries = [...passages]
    .filter((passage) => passage.fin > passage.debut)
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin);
  const reunis: Passage[] = [];
  for (const passage of tries) {
    const precedent = reunis[reunis.length - 1];
    if (precedent && passage.debut <= precedent.fin) {
      precedent.fin = Math.max(precedent.fin, passage.fin);
    } else {
      reunis.push({ ...passage });
    }
  }
  return reunis;
}

/**
 * Suit les passages quand le texte change sous eux. On cherche ce que la frappe a touché
 * (ce qui diffère entre le début commun et la fin commune des deux textes) :
 * un passage placé avant ne bouge pas, un passage placé après se décale, et un passage
 * touché garde ce qu'il lui reste.
 */
export function decalerPassages(avant: string, apres: string, passages: Passage[]): Passage[] {
  if (passages.length === 0 || avant === apres) return passages;
  const anciens = Array.from(avant);
  const nouveaux = Array.from(apres);

  let debutCommun = 0;
  const limite = Math.min(anciens.length, nouveaux.length);
  while (debutCommun < limite && anciens[debutCommun] === nouveaux[debutCommun]) debutCommun += 1;
  let finCommune = 0;
  while (
    finCommune < limite - debutCommun &&
    anciens[anciens.length - 1 - finCommune] === nouveaux[nouveaux.length - 1 - finCommune]
  ) {
    finCommune += 1;
  }

  // Ce que la frappe a remplacé, dans l'ancien texte ; et où cela finit dans le nouveau.
  const finTouchee = anciens.length - finCommune;
  const repriseApres = nouveaux.length - finCommune;
  const decalage = nouveaux.length - anciens.length;

  return reunir(
    passages.map((passage) => {
      if (passage.fin <= debutCommun) return passage;
      if (passage.debut >= finTouchee) {
        return { ...passage, debut: passage.debut + decalage, fin: passage.fin + decalage };
      }
      return {
        ...passage,
        debut: passage.debut < debutCommun ? passage.debut : repriseApres,
        fin: passage.fin > finTouchee ? passage.fin + decalage : debutCommun,
      };
    }),
  );
}

/**
 * Voile les passages abîmés, comme le fait la base avant de laisser sortir un texte :
 * chaque caractère devient « · », sauf les retours à la ligne.
 */
export function voiler(texte: string, passages: Passage[]): string {
  if (passages.length === 0) return texte;
  const lettres = Array.from(texte);
  for (const { debut, fin } of passages) {
    for (let rang = Math.max(0, debut); rang < Math.min(fin, lettres.length); rang += 1) {
      if (lettres[rang] !== '\n' && lettres[rang] !== '\r') lettres[rang] = VOILE;
    }
  }
  return lettres.join('');
}

export type Morceau = { texte: string; reecrit: boolean; abime: boolean };

/**
 * Découpe un texte en morceaux d'un seul tenant : réécrit ou non, abîmé ou non.
 * Un passage qui déborde du texte est ramené à ses limites.
 */
export function morceaux(texte: string, reecrits: Passage[], abimes: Passage[]): Morceau[] {
  const lettres = Array.from(texte);
  const marquer = (passages: Passage[]) => {
    const marques = new Array<boolean>(lettres.length).fill(false);
    for (const { debut, fin } of passages) {
      for (let rang = Math.max(0, debut); rang < Math.min(fin, lettres.length); rang += 1) {
        marques[rang] = true;
      }
    }
    return marques;
  };
  const reecrit = marquer(reecrits);
  const abime = marquer(abimes);

  const resultat: Morceau[] = [];
  for (let rang = 0; rang < lettres.length; rang += 1) {
    const dernier = resultat[resultat.length - 1];
    if (dernier && dernier.reecrit === reecrit[rang] && dernier.abime === abime[rang]) {
      dernier.texte += lettres[rang];
    } else {
      resultat.push({ texte: lettres[rang], reecrit: reecrit[rang], abime: abime[rang] });
    }
  }
  if (resultat.length === 0) resultat.push({ texte: '', reecrit: false, abime: false });
  return resultat;
}
