import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Attente } from '@/composants/Attente';
import { Main } from '@/composants/Main';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { Brouillon } from '@/types/Brouillon';
import type { BrouillonResume } from '@/types/BrouillonResume';
import type { Ecritoire as EcritoireServeur } from '@/types/Ecritoire';

const mots = vocabulaire.ecritoire;

/** L'écritoire : ce qu'il reste à envoyer cette semaine, et les brouillons en cours. */
export function Ecritoire() {
  const naviguer = useNavigate();
  const { donnees, erreur } = useLecture<EcritoireServeur>('/joueur/ecritoire');
  const [occupe, setOccupe] = useState(false);

  if (!donnees) return <Attente erreur={erreur} />;

  async function commencer() {
    setOccupe(true);
    try {
      const billet = await appeler<Brouillon>('/joueur/brouillons', {});
      naviguer(`/ecrire/${billet.id}`);
    } catch (e) {
      toast.error(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <>
      <h1 className="mb-2 font-serif text-2xl">{mots.titre}</h1>
      <p className="mb-6 text-muted-foreground">{mots.restantes(donnees.lettres_restantes)}</p>

      <Button size="lg" className="h-11" disabled={occupe} onClick={commencer}>
        <PlusIcon />
        {mots.nouveau}
      </Button>

      <h2 className="mt-10 mb-3 font-serif text-lg">{mots.brouillons}</h2>
      {donnees.brouillons.length === 0 ? (
        <p className="text-muted-foreground">{mots.aucunBrouillon}</p>
      ) : (
        <ul className="grid gap-3">
          {donnees.brouillons.map((brouillon) => (
            <li key={brouillon.id}>
              <Link
                to={`/ecrire/${brouillon.id}`}
                className="block rounded-sm bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10 outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-sm text-muted-foreground">{adresse(brouillon)}</p>
                <p className="mt-1 line-clamp-2 text-lg">
                  {brouillon.debut.trim() === '' ? (
                    <span className="text-base text-muted-foreground">{mots.billetVierge}</span>
                  ) : (
                    <Main police={donnees.police}>{brouillon.debut}</Main>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function adresse(brouillon: BrouillonResume): string {
  if (brouillon.destinataire === null) return mots.sansDestinataire;
  // Le serveur désigne la gazette par un nom vide : c'est le thème qui la nomme.
  if (brouillon.destinataire === '') return mots.pourLaGazette;
  return mots.pour(brouillon.destinataire);
}
