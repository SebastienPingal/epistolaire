import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

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

/** L'état d'un écran qui attend ses données, ou qui n'a pas pu les lire. */
export function Attente({ erreur }: { erreur: string | null }) {
  return erreur ? (
    <p role="alert" className="text-destructive">
      {erreur}
    </p>
  ) : (
    <p className="text-muted-foreground">Chargement…</p>
  );
}

type ConfirmationProps = {
  ouverte: boolean;
  titre: string;
  texte: string;
  action: string;
  surReponse: (confirme: boolean) => void;
};

/** Une demande de confirmation avant un geste sans retour. */
export function Confirmation({ ouverte, titre, texte, action, surReponse }: ConfirmationProps) {
  return (
    <Dialog open={ouverte} onOpenChange={(ouvert) => !ouvert && surReponse(false)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
          <DialogDescription>{texte}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => surReponse(false)}>
            Annuler
          </Button>
          <Button variant="destructive" onClick={() => surReponse(true)}>
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
