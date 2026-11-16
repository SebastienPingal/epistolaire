import { estManuscrit, seSigne } from '@/outils/gabarits';
import type { Contenu } from '@/types/Contenu';
import type { Passage } from '@/types/Passage';

import { ActeLu } from './ActeLu';
import { BilletLu } from './BilletLu';
import { CarteLue } from './CarteLue';
import { EncreDuDocument, type Signature } from './encre';
import type { SceauLu } from './Feuille';
import { GazetteLue } from './GazetteLue';
import { LettreLongueLue } from './LettreLongueLue';
import { RapportLu } from './RapportLu';

type Props = {
  /** Le gabarit et ses cases. Pour un joueur, les passages abîmés y sont déjà voilés. */
  contenu: Contenu;
  /** L'écriture du document, s'il est écrit à la main. */
  police: string | null;
  /** La date d'écriture, déjà mise en mots. */
  date: string | null;
  signature: Signature | null;
  /** Le sceau qui ferme le pli. Il ne figure à l'intérieur que sur un document signé. */
  sceau: SceauLu | null;
  /** Les passages réécrits que ce lecteur remarque, tracés dans la main du faussaire. */
  passages?: Passage[];
  policeReecriture?: string | null;
  /** Les passages abîmés : une tache à leur place. */
  passagesAbimes?: Passage[];
  /** Où demander une image du document : la réponse dépend de qui regarde. */
  adresseImage: (image: string) => string;
  /** Sans la feuille de papier autour : pour un document montré dans un autre cadre. */
  nu?: boolean;
  className?: string;
};

/**
 * Un document tel qu'on le lit, quel que soit son gabarit. C'est le même rendu pour le
 * joueur qui ouvre son pli et pour le MJ qui prépare ou relit un document.
 */
export function Document({
  contenu,
  police,
  date,
  signature,
  sceau,
  passages = [],
  policeReecriture = null,
  passagesAbimes = [],
  adresseImage,
  nu = false,
  className,
}: Props) {
  // Seuls les gabarits écrits à la main portent une signature et un cachet à l'intérieur.
  const signe = seSigne(contenu.gabarit);
  const pied = { signature: signe ? signature : null, sceau: signe ? sceau : null };

  return (
    <EncreDuDocument
      encre={{
        police,
        manuscrit: estManuscrit(contenu.gabarit),
        reecrits: passages,
        policeReecriture,
        abimes: passagesAbimes,
        nu,
      }}
    >
      {(() => {
        switch (contenu.gabarit) {
          case 'billet':
            return <BilletLu contenu={contenu} date={date} {...pied} className={className} />;
          case 'lettre_longue':
            return <LettreLongueLue contenu={contenu} date={date} {...pied} className={className} />;
          case 'acte':
            return <ActeLu contenu={contenu} date={date} {...pied} className={className} />;
          case 'gazette':
            return <GazetteLue contenu={contenu} className={className} />;
          case 'rapport':
            return <RapportLu contenu={contenu} date={date} className={className} />;
          case 'carte':
            return <CarteLue contenu={contenu} adresseImage={adresseImage} className={className} />;
        }
      })()}
    </EncreDuDocument>
  );
}
