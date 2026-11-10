import { useEffect, useState } from 'react';

import { appeler } from '@/api';
import { cn } from '@/lib/utils';
import { vocabulaire } from '@/theme/neutre';
import type { Sante } from '@/types/Sante';

type Etat =
  | { etape: 'attente' }
  | { etape: 'recu'; sante: Sante }
  | { etape: 'echec' };

/** Page de contrôle des étapes 1 et 2. Elle sera remplacée par la connexion. */
export function App() {
  const [etat, setEtat] = useState<Etat>({ etape: 'attente' });

  useEffect(() => {
    let actif = true;
    appeler<Sante>('/sante')
      .then((sante) => actif && setEtat({ etape: 'recu', sante }))
      .catch(() => actif && setEtat({ etape: 'echec' }));
    return () => {
      actif = false;
    };
  }, []);

  const sante = etat.etape === 'recu' ? etat.sante : null;
  const serveur = etat.etape === 'attente' ? null : sante !== null;
  const base = etat.etape === 'attente' ? null : (sante?.base ?? false);
  const structure = etat.etape === 'attente' ? null : (sante?.structure ?? null) !== null;

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-6 font-serif text-2xl text-balance">{vocabulaire.nomDuSite}</h1>
      <ul className="divide-y border-y">
        <Ligne libelle="Le serveur" ok={serveur} />
        <Ligne libelle="La base de données" ok={base} />
        <Ligne
          libelle="La structure de la base"
          ok={structure}
          oui={`en place (version ${sante?.structure ?? ''})`}
          non="absente"
        />
      </ul>
    </main>
  );
}

type LigneProps = {
  libelle: string;
  ok: boolean | null;
  oui?: string;
  non?: string;
};

function Ligne({ libelle, ok, oui = 'répond', non = 'ne répond pas' }: LigneProps) {
  const reponse = ok === null ? '…' : ok ? oui : non;
  return (
    <li className="flex justify-between gap-4 py-3">
      <span>{libelle}</span>
      <span
        className={cn(
          'text-muted-foreground',
          ok === true && 'text-bon',
          ok === false && 'text-destructive',
        )}
      >
        {reponse}
      </span>
    </li>
  );
}
