import type { LettreLongue } from '@/types/LettreLongue';

import { Ecrit, type Signature } from './encre';
import { DateEcrite, Feuille, PiedSigne, type SceauLu } from './Feuille';

type Props = {
  contenu: LettreLongue;
  /** La date d'écriture, montrée quand la lettre ne dit pas elle-même son lieu et sa date. */
  date: string | null;
  signature: Signature | null;
  sceau: SceauLu | null;
  className?: string;
};

/**
 * Une lettre longue : le lieu et la date en haut à droite, de la main de l'auteur, puis le
 * texte, la signature et le cachet. Plus ample qu'un billet, et faite pour être lue longtemps.
 */
export function LettreLongueLue({ contenu, date, signature, sceau, className }: Props) {
  return (
    <Feuille className={className}>
      {contenu.lieu_et_date.trim() === '' ? (
        <DateEcrite date={date} />
      ) : (
        <p className="mb-6 text-right text-lg break-words">
          <Ecrit champ="lieu_et_date" texte={contenu.lieu_et_date} />
        </p>
      )}
      <p className="text-xl leading-loose break-words whitespace-pre-wrap">
        <Ecrit champ="texte" texte={contenu.texte} />
      </p>
      <PiedSigne signature={signature} sceau={sceau} />
    </Feuille>
  );
}
