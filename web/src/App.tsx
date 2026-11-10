import { useEffect, useState } from 'react';

import { appeler } from '@/api';
import { cn } from '@/lib/utils';
import { vocabulaire } from '@/theme/neutre';
import type { Sante } from '@/types/Sante';

type Etat =
  | { etape: 'attente' }
  | { etape: 'recu'; sante: Sante }
  | { etape: 'echec' };

/** Page de contrôle de l'étape 1. Elle sera remplacée par la connexion. */
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

  const serveur = etat.etape === 'attente' ? null : etat.etape === 'recu';
  const base = etat.etape === 'attente' ? null : etat.etape === 'recu' && etat.sante.base;

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-6 font-serif text-2xl text-balance">{vocabulaire.nomDuSite}</h1>
      <ul className="divide-y border-y">
        <Ligne libelle="Le serveur" ok={serveur} />
        <Ligne libelle="La base de données" ok={base} />
      </ul>
    </main>
  );
}

function Ligne({ libelle, ok }: { libelle: string; ok: boolean | null }) {
  const reponse = ok === null ? '…' : ok ? 'répond' : 'ne répond pas';
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
