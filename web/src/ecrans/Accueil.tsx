import { useState } from 'react';

import { appeler } from '@/api';
import { Button } from '@/components/ui/button';
import { vocabulaire } from '@/theme/neutre';
import type { Moi } from '@/types/Moi';

const mots = vocabulaire.accueil;

type Props = {
  moi: Moi;
  surDeconnexion: () => void;
};

/** Écran provisoire de l'étape 3 : il dit seulement qui est connecté. */
export function Accueil({ moi, surDeconnexion }: Props) {
  const [occupe, setOccupe] = useState(false);

  async function deconnecter() {
    setOccupe(true);
    // Même si le serveur ne répond pas, on revient à l'écran de connexion.
    await appeler('/deconnexion', {}).catch(() => undefined);
    surDeconnexion();
  }

  const presentation =
    moi.role === 'mj'
      ? mots.mj
      : moi.personnage
        ? mots.joueur(moi.personnage.nom)
        : mots.sansPersonnage;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <h1 className="font-serif text-3xl text-balance">{vocabulaire.nomDuSite}</h1>
      <p>{presentation}</p>
      <Button variant="outline" className="h-11 self-start" disabled={occupe} onClick={deconnecter}>
        {mots.deconnexion}
      </Button>
    </main>
  );
}
