import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export { Attente } from '@/composants/Attente';
export { Confirmation } from '@/composants/Confirmation';

/** Le titre d'un écran, avec ses actions à droite. */
export function Entete({ titre, children }: { titre: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-serif text-2xl text-balance">{titre}</h1>
      {children}
    </div>
  );
}

/** Une partie d'écran, avec son titre et une explication facultative. */
export function Section({
  titre,
  aide,
  children,
}: {
  titre: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <h2 className="font-serif text-lg">{titre}</h2>
      {aide && <p className="mt-1 text-sm text-muted-foreground">{aide}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Un champ de formulaire : son libellé, le champ, et une aide facultative. */
export function Champ({
  libelle,
  pour,
  aide,
  children,
}: {
  libelle: string;
  pour: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={pour}>{libelle}</Label>
      {children}
      {aide && <p className="text-sm text-muted-foreground">{aide}</p>}
    </div>
  );
}
