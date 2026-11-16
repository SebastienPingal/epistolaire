import { vocabulaire } from '@/theme/neutre';
import type { Carte } from '@/types/Carte';

import { Ecrit } from './encre';
import { Feuille } from './Feuille';

/**
 * Une carte ou une illustration : l'image, puis son titre et sa légende, imprimés.
 * L'image garde ses proportions et tient toujours dans la largeur de l'écran ; on peut
 * l'ouvrir seule pour l'agrandir avec les doigts.
 */
export function CarteLue({
  contenu,
  adresseImage,
  className,
}: {
  contenu: Carte;
  /** Où demander l'image : la réponse dépend de qui regarde. */
  adresseImage: (image: string) => string;
  className?: string;
}) {
  const a = (texte: string) => texte.trim() !== '';
  const adresse = contenu.image ? adresseImage(contenu.image) : null;
  return (
    <Feuille imprimee className={className}>
      {adresse && (
        <a href={adresse} target="_blank" rel="noreferrer" className="block">
          <img
            src={adresse}
            alt={a(contenu.titre) ? contenu.titre : vocabulaire.gabarits.carte.image}
            className="mx-auto max-h-[80dvh] w-auto max-w-full rounded-sm ring-1 ring-foreground/10"
          />
        </a>
      )}
      {a(contenu.titre) && (
        <h2 className="mt-4 text-center text-xl leading-snug font-bold break-words text-balance">
          <Ecrit champ="titre" texte={contenu.titre} />
        </h2>
      )}
      {a(contenu.legende) && (
        <p className="mt-1.5 text-center leading-relaxed break-words whitespace-pre-wrap text-muted-foreground italic">
          <Ecrit champ="legende" texte={contenu.legende} />
        </p>
      )}
    </Feuille>
  );
}
