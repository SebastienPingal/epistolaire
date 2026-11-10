import { Button } from '@/components/ui/button';
import { vocabulaire } from '@/theme/neutre';
import type { Moi } from '@/types/Moi';

const mots = vocabulaire.accueil;

type Props = {
  moi: Moi;
  surDeconnexion: () => void;
};

/** Écran provisoire des joueurs : il dit seulement qui est connecté. */
export function Accueil({ moi, surDeconnexion }: Props) {
  const presentation = moi.personnage ? mots.joueur(moi.personnage.nom) : mots.sansPersonnage;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-12">
      <h1 className="font-serif text-3xl text-balance">{vocabulaire.nomDuSite}</h1>
      <p>{presentation}</p>
      <Button variant="outline" className="h-11 self-start" onClick={surDeconnexion}>
        {mots.deconnexion}
      </Button>
    </main>
  );
}
