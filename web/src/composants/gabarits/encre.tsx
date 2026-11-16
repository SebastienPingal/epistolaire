/**
 * L'encre d'un document : comment se trace chacune de ses cases.
 *
 * Les six gabarits partagent les mêmes règles :
 *
 * * un gabarit écrit à la main se trace dans l'écriture de son auteur ; un gabarit imprimé,
 *   dans la police du texte courant ;
 * * un passage réécrit que le destinataire a remarqué paraît dans la main du faussaire,
 *   même sur un document imprimé : c'est une retouche à la plume ;
 * * un passage abîmé est une tache. Son texte n'arrive jamais jusqu'ici : le serveur l'a
 *   déjà remplacé par des « · ».
 *
 * Les passages désignent leur case par son chemin : `texte`, `articles.2.texte`…
 */
import { createContext, type ReactNode, useContext } from 'react';

import { Main } from '@/composants/Main';
import { passagesDe } from '@/outils/gabarits';
import { morceaux } from '@/outils/passages';
import { vocabulaire } from '@/theme/neutre';
import type { Passage } from '@/types/Passage';

type Encre = {
  /** L'écriture du document. Sans objet pour un gabarit imprimé. */
  police: string | null;
  manuscrit: boolean;
  /** Les passages réécrits que ce lecteur remarque, tracés dans la main du faussaire. */
  reecrits: Passage[];
  policeReecriture: string | null;
  abimes: Passage[];
  /** Sans la feuille de papier autour : pour un document montré dans un autre cadre. */
  nu: boolean;
};

const ContexteEncre = createContext<Encre>({
  police: null,
  manuscrit: false,
  reecrits: [],
  policeReecriture: null,
  abimes: [],
  nu: false,
});

export const useEncre = () => useContext(ContexteEncre);

export function EncreDuDocument({ encre, children }: { encre: Encre; children: ReactNode }) {
  return <ContexteEncre.Provider value={encre}>{children}</ContexteEncre.Provider>;
}

/** Le texte d'une case, tracé comme il se doit : écrit, imprimé, retouché ou taché. */
export function Ecrit({ champ, texte }: { champ: string; texte: string }) {
  const { police, manuscrit, reecrits, policeReecriture, abimes } = useContext(ContexteEncre);
  const trace = (morceau: string) =>
    manuscrit ? <Main police={police}>{morceau}</Main> : morceau;

  return (
    <>
      {morceaux(texte, passagesDe(reecrits, champ), passagesDe(abimes, champ)).map(
        (morceau, rang) =>
          morceau.abime ? (
            // Une tache : on voit qu'il y avait du texte, on ne peut pas le lire.
            <span key={rang} className="tache" role="img" aria-label={vocabulaire.pli.illisible}>
              {trace(morceau.texte)}
            </span>
          ) : morceau.reecrit ? (
            <Main key={rang} police={policeReecriture}>
              {morceau.texte}
            </Main>
          ) : manuscrit ? (
            <Main key={rang} police={police}>
              {morceau.texte}
            </Main>
          ) : (
            <span key={rang}>{morceau.texte}</span>
          ),
      )}
    </>
  );
}

/** Une signature, tracée dans sa propre écriture, et un sceau : le bas d'un document signé. */
export type Signature = { nom: string; police: string | null };
