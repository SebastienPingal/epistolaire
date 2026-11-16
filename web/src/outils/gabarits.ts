/**
 * Les gabarits, côté navigateur : leurs cases de texte et leurs chemins.
 *
 * C'est le pendant de `src/gabarits.rs`. Une case de texte se désigne par son chemin
 * (`texte`, `articles.2.texte`, `rubriques.0.titre`) : c'est lui que portent les passages
 * réécrits ou abîmés. L'ordre des cases est le même que celui du serveur.
 */
import type { Contenu } from '@/types/Contenu';
import type { Gabarit } from '@/types/Gabarit';
import type { Passage } from '@/types/Passage';

import { reecrituresLocales, voiler } from './passages';

/** Écrit à la main, dans l'écriture de l'expéditeur. Les autres gabarits sont imprimés. */
export const estManuscrit = (gabarit: Gabarit) =>
  gabarit === 'billet' || gabarit === 'lettre_longue' || gabarit === 'acte';

/** Porte une signature sous le texte : ce sont les gabarits écrits à la main. */
export const seSigne = estManuscrit;

/** Une case de texte d'un document. */
export type Case = {
  chemin: string;
  texte: string;
  /** Un long texte, sur plusieurs lignes ; sinon un titre, un lieu, un nom. */
  long: boolean;
};

const LONGS = new Set(['texte', 'legende', 'formule_finale']);

const uneCase = (chemin: string, texte: string): Case => ({
  chemin,
  texte,
  long: LONGS.has(chemin.split('.').pop() ?? ''),
});

/** Toutes les cases de texte d'un contenu, dans l'ordre où on les lit. */
export function casesDe(contenu: Contenu): Case[] {
  switch (contenu.gabarit) {
    case 'billet':
      return [uneCase('texte', contenu.texte)];
    case 'lettre_longue':
      return [uneCase('lieu_et_date', contenu.lieu_et_date), uneCase('texte', contenu.texte)];
    case 'gazette':
      return [
        uneCase('titre', contenu.titre),
        uneCase('numero', contenu.numero),
        uneCase('date', contenu.date),
        ...contenu.articles.flatMap((article, rang) => [
          uneCase(`articles.${rang}.titre`, article.titre),
          uneCase(`articles.${rang}.texte`, article.texte),
        ]),
        ...contenu.courrier.flatMap((lettre, rang) => [
          uneCase(`courrier.${rang}.texte`, lettre.texte),
          ...(lettre.signature === null
            ? []
            : [uneCase(`courrier.${rang}.signature`, lettre.signature)]),
        ]),
      ];
    case 'acte':
      return [
        uneCase('autorite', contenu.autorite),
        uneCase('objet', contenu.objet),
        uneCase('texte', contenu.texte),
        uneCase('formule_finale', contenu.formule_finale),
      ];
    case 'rapport':
      return [
        uneCase('titre', contenu.titre),
        uneCase('auteur', contenu.auteur),
        ...contenu.rubriques.flatMap((rubrique, rang) => [
          uneCase(`rubriques.${rang}.titre`, rubrique.titre),
          uneCase(`rubriques.${rang}.texte`, rubrique.texte),
        ]),
      ];
    case 'carte':
      return [uneCase('titre', contenu.titre), uneCase('legende', contenu.legende)];
  }
}

/** Le même contenu, avec un autre texte dans une de ses cases. */
export function ecrireCase(contenu: Contenu, chemin: string, texte: string): Contenu {
  const copie = structuredClone(contenu) as unknown as Record<string, unknown>;
  const etapes = chemin.split('.');
  let cible: Record<string, unknown> = copie;
  for (const etape of etapes.slice(0, -1)) {
    cible = cible[etape] as Record<string, unknown>;
    if (cible === undefined || cible === null) return contenu;
  }
  cible[etapes[etapes.length - 1]] = texte;
  return copie as unknown as Contenu;
}

/** Les passages d'une case. */
export const passagesDe = (passages: Passage[], chemin: string) =>
  passages.filter((passage) => passage.champ === chemin);

/**
 * Les passages réécrits de tout un document, repérés dans le navigateur, case par case.
 * Ce n'est qu'un aperçu pendant la frappe : celui qui compte est celui du serveur.
 */
export function reecrituresDuContenu(original: Contenu, livre: Contenu): Passage[] {
  const avant = new Map(casesDe(original).map(({ chemin, texte }) => [chemin, texte]));
  return casesDe(livre).flatMap(({ chemin, texte }) =>
    reecrituresLocales(avant.get(chemin) ?? '', texte).map((passage) => ({
      ...passage,
      champ: chemin,
    })),
  );
}

/** Voile les passages abîmés de tout un document, comme le fait la base pour les joueurs. */
export function voilerContenu(contenu: Contenu, abimes: Passage[]): Contenu {
  let voile = contenu;
  for (const { chemin, texte } of casesDe(contenu)) {
    const passages = passagesDe(abimes, chemin);
    if (passages.length > 0) voile = ecrireCase(voile, chemin, voiler(texte, passages));
  }
  return voile;
}

/** Deux contenus sont-ils les mêmes, case pour case ? */
export const memeContenu = (a: Contenu, b: Contenu) => JSON.stringify(a) === JSON.stringify(b);

/** Un contenu aux cases vides, pour commencer un document. */
export function contenuVierge(gabarit: Gabarit): Contenu {
  switch (gabarit) {
    case 'billet':
      return { gabarit, texte: '' };
    case 'lettre_longue':
      return { gabarit, lieu_et_date: '', texte: '' };
    case 'gazette':
      return {
        gabarit,
        titre: '',
        numero: '',
        date: '',
        articles: [{ titre: '', texte: '' }],
        courrier: [],
      };
    case 'acte':
      return { gabarit, autorite: '', objet: '', texte: '', formule_finale: '' };
    case 'rapport':
      return { gabarit, titre: '', auteur: '', rubriques: [{ titre: '', texte: '' }] };
    case 'carte':
      return { gabarit, image: '', titre: '', legende: '' };
  }
}
