import type { Billet } from '@/types/Billet';

import { Ecrit, type Signature } from './encre';
import { DateEcrite, Feuille, PiedSigne, type SceauLu } from './Feuille';

type Props = {
  contenu: Billet;
  /** La date d'écriture, déjà mise en mots. */
  date: string | null;
  signature: Signature | null;
  sceau: SceauLu | null;
  className?: string;
};

/**
 * Un billet tel qu'on le lit : la feuille, le texte dans l'écriture de son auteur,
 * la date en haut, la signature et le cachet en bas.
 */
export function BilletLu({ contenu, date, signature, sceau, className }: Props) {
  return (
    <Feuille className={className}>
      <DateEcrite date={date} />
      <p className="text-xl leading-relaxed break-words whitespace-pre-wrap">
        <Ecrit champ="texte" texte={contenu.texte} />
      </p>
      <PiedSigne signature={signature} sceau={sceau} />
    </Feuille>
  );
}
