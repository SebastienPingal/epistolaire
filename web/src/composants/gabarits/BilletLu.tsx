import { Cachet } from '@/composants/Cachet';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import { morceaux } from '@/outils/passages';
import { vocabulaire } from '@/theme/neutre';
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
  /**
   * Les passages abîmés : une tache à leur place. Leur texte n'arrive jamais jusqu'ici :
   * le serveur l'a déjà remplacé par des « · ».
   */
  passagesAbimes?: Passage[];
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
  passagesAbimes = [],
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
        {morceaux(texte, passages, passagesAbimes).map((morceau, rang) =>
          morceau.abime ? (
            // Une tache : on voit qu'il y avait du texte, on ne peut pas le lire.
            <span key={rang} className="tache" role="img" aria-label={vocabulaire.pli.illisible}>
              <Main police={police}>{morceau.texte}</Main>
            </span>
          ) : (
            <Main key={rang} police={morceau.reecrit ? policeReecriture : police}>
              {morceau.texte}
            </Main>
          ),
        )}
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
