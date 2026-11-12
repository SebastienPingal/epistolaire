import { Cachet } from '@/composants/Cachet';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import type { EtatSceau } from '@/types/EtatSceau';
import type { Passage } from '@/types/Passage';

type Props = {
  texte: string;
  /** L'écriture du texte. */
  police: string | null;
  /** La date d'écriture, déjà mise en mots. */
  date: string | null;
  signature: { nom: string; police: string | null } | null;
  sceau: { nom: string; initiales: string; etat?: EtatSceau } | null;
  /** Les passages réécrits, tracés dans la main du faussaire. */
  passages?: Passage[];
  policeReecriture?: string | null;
  className?: string;
};

/**
 * Un billet tel qu'on le lit : la feuille, le texte dans l'écriture de son auteur,
 * la date en haut, la signature et le cachet en bas.
 *
 * Il sert à la lecture d'un pli par un joueur, et servira au MJ et aux autres gabarits.
 */
export function BilletLu({
  texte,
  police,
  date,
  signature,
  sceau,
  passages = [],
  policeReecriture = null,
  className,
}: Props) {
  return (
    <article
      className={cn(
        'rounded-sm bg-card px-5 pt-4 pb-5 shadow-sm ring-1 ring-foreground/10 sm:px-7 sm:pt-6 sm:pb-7',
        className,
      )}
    >
      {date && <p className="mb-4 text-right font-serif text-sm text-muted-foreground">{date}</p>}

      <p className="text-xl leading-relaxed break-words whitespace-pre-wrap">
        {morceaux(texte, passages).map((morceau, rang) => (
          <Main key={rang} police={morceau.reecrit ? policeReecriture : police}>
            {morceau.texte}
          </Main>
        ))}
      </p>

      {(signature || sceau) && (
        <div className="mt-5 flex min-h-12 items-end justify-between gap-4">
          {sceau ? (
            <Cachet
              initiales={sceau.initiales}
              nom={sceau.nom}
              etat={sceau.etat}
              className="size-12"
            />
          ) : (
            <span />
          )}
          {signature && (
            <Main police={signature.police} className="text-right text-2xl">
              {signature.nom}
            </Main>
          )}
        </div>
      )}
    </article>
  );
}

type Morceau = { texte: string; reecrit: boolean };

/**
 * Découpe le texte selon les passages réécrits. Les positions comptent les caractères,
 * comme le serveur ; un passage qui déborde du texte est ramené à ses limites.
 */
function morceaux(texte: string, passages: Passage[]): Morceau[] {
  const lettres = Array.from(texte);
  const tries = [...passages]
    .map(({ debut, fin }) => ({
      debut: Math.max(0, Math.min(debut, lettres.length)),
      fin: Math.max(0, Math.min(fin, lettres.length)),
    }))
    .filter(({ debut, fin }) => fin > debut)
    .sort((a, b) => a.debut - b.debut);

  const resultat: Morceau[] = [];
  let position = 0;
  for (const { debut, fin } of tries) {
    const depart = Math.max(debut, position);
    if (fin <= depart) continue;
    if (depart > position) {
      resultat.push({ texte: lettres.slice(position, depart).join(''), reecrit: false });
    }
    resultat.push({ texte: lettres.slice(depart, fin).join(''), reecrit: true });
    position = fin;
  }
  if (position < lettres.length || resultat.length === 0) {
    resultat.push({ texte: lettres.slice(position).join(''), reecrit: false });
  }
  return resultat;
}
