import type { ReactNode } from 'react';

import { Cachet } from '@/composants/Cachet';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import type { EtatSceau } from '@/types/EtatSceau';

import { type Signature, useEncre } from './encre';

/** Le sceau tel qu'il se voit sur un document. */
export type SceauLu = {
  nom: string;
  initiales: string;
  etat?: EtatSceau;
  /** L'adresse de son image, s'il en a une. */
  image?: string | null;
};

/** La feuille de papier sur laquelle tout document est posé. Sa hauteur suit le contenu. */
export function Feuille({
  imprimee = false,
  className,
  children,
}: {
  /** Un document imprimé se lit dans la police du texte courant. */
  imprimee?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { nu } = useEncre();
  return (
    <article
      data-document
      className={cn(
        !nu &&
          'rounded-sm bg-card px-5 pt-4 pb-5 shadow-sm ring-1 ring-foreground/10 sm:px-7 sm:pt-6 sm:pb-7',
        imprimee && 'font-serif',
        className,
      )}
    >
      {children}
    </article>
  );
}

/** La date d'écriture, en haut à droite d'un document. */
export function DateEcrite({ date }: { date: string | null }) {
  if (!date) return null;
  return <p className="mb-4 text-right font-serif text-sm text-muted-foreground">{date}</p>;
}

/** Le bas d'un document signé : le cachet à gauche, la signature à droite. */
export function PiedSigne({
  signature,
  sceau,
}: {
  signature: Signature | null;
  sceau: SceauLu | null;
}) {
  if (!signature && !sceau) return null;
  return (
    <div className="mt-5 flex min-h-12 items-end justify-between gap-4">
      {sceau ? (
        <Cachet
          initiales={sceau.initiales}
          nom={sceau.nom}
          etat={sceau.etat}
          image={sceau.image}
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
  );
}
