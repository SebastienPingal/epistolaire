import type { Acte } from '@/types/Acte';

import { Ecrit, type Signature } from './encre';
import { DateEcrite, Feuille, PiedSigne, type SceauLu } from './Feuille';

type Props = {
  contenu: Acte;
  date: string | null;
  signature: Signature | null;
  sceau: SceauLu | null;
  className?: string;
};

/**
 * Un acte officiel : l'autorité qui parle en tête, l'objet, le texte, la formule finale,
 * puis la signature et le sceau. Écrit à la main, mais avec la solennité d'un acte :
 * tout est centré, encadré d'un double filet.
 */
export function ActeLu({ contenu, date, signature, sceau, className }: Props) {
  const a = (texte: string) => texte.trim() !== '';
  return (
    <Feuille className={className}>
      <div className="border-y-4 border-double border-foreground/25 py-5">
        {a(contenu.autorite) && (
          <p className="text-center text-2xl leading-snug break-words text-balance">
            <Ecrit champ="autorite" texte={contenu.autorite} />
          </p>
        )}
        {a(contenu.objet) && (
          <p className="mt-3 text-center text-lg break-words text-balance text-muted-foreground">
            <Ecrit champ="objet" texte={contenu.objet} />
          </p>
        )}
        {(a(contenu.autorite) || a(contenu.objet)) && (
          <hr className="mx-auto my-5 w-16 border-foreground/25" />
        )}
        <p className="text-xl leading-relaxed break-words whitespace-pre-wrap">
          <Ecrit champ="texte" texte={contenu.texte} />
        </p>
        {a(contenu.formule_finale) && (
          <p className="mt-5 text-right text-lg leading-relaxed break-words whitespace-pre-wrap">
            <Ecrit champ="formule_finale" texte={contenu.formule_finale} />
          </p>
        )}
      </div>
      {date && <div className="mt-4 -mb-4"><DateEcrite date={date} /></div>}
      <PiedSigne signature={signature} sceau={sceau} />
    </Feuille>
  );
}
