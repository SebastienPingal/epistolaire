import { ArrowLeftIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Button } from '@/components/ui/button';
import { Attente } from '@/composants/Attente';
import { Confirmation } from '@/composants/Confirmation';
import { BilletLu } from '@/composants/gabarits/BilletLu';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { Destination } from '@/types/Destination';
import type { Pli as PliServeur } from '@/types/Pli';

import { Ouverture } from './Ouverture';
import { ChoixDossier } from './rangement';

const mots = vocabulaire.pli;

/** Un pli reçu : fermé, on l'ouvre d'un geste ; ouvert, on le lit et on le range. */
export function Pli() {
  const { id } = useParams();
  // La clé remet l'écran à neuf quand on passe d'un pli à un autre.
  return <LecturePli key={id} id={id ?? ''} />;
}

function LecturePli({ id }: { id: string }) {
  const naviguer = useNavigate();
  const { state } = useLocation();
  const retour = (state as { retour?: string } | null)?.retour ?? '/reception';

  const lecture = useLecture<PliServeur>(`/joueur/plis/${id}`);
  const [ouvert, setOuvert] = useState<PliServeur | null>(null);
  const [demande, setDemande] = useState<'ranger' | 'detruire' | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const pli = ouvert ?? lecture.donnees;

  if (!pli) {
    return (
      <>
        <Retour vers={retour} />
        {lecture.erreur ? (
          <p role="alert" className="text-muted-foreground">
            {mots.introuvable}
          </p>
        ) : (
          <Attente erreur={null} />
        )}
      </>
    );
  }

  const { exterieur, contenu } = pli;
  const arrive = vocabulaire.date(exterieur.arrive_le);

  async function ranger(destination: { id: string | null; nom: string } | undefined) {
    setDemande(null);
    if (!destination) return;
    try {
      await modifier(`/joueur/plis/${id}/dossier`, {
        dossier_id: destination.id,
      } satisfies Destination);
      toast.success(vocabulaire.reception.ranges(1, destination.nom));
      setOuvert(await appeler<PliServeur>(`/joueur/plis/${id}`));
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  async function detruire(confirme: boolean) {
    setDemande(null);
    if (!confirme) return;
    try {
      await supprimer(`/joueur/plis/${id}`);
      toast.success(vocabulaire.reception.detruits(1));
      naviguer(retour, { replace: true });
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <>
      <Retour vers={retour} />

      {!contenu ? (
        <div className="flex min-h-[55dvh] flex-col justify-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            {vocabulaire.reception.arrive(arrive)}
          </p>
          <Ouverture
            sceau={exterieur.sceau}
            ouvrir={() => appeler<PliServeur>(`/joueur/plis/${id}/ouverture`, {})}
            surOuvert={(recu) => {
              setErreur(null);
              setOuvert(recu);
            }}
            surErreur={setErreur}
          />
        </div>
      ) : (
        <>
          <BilletLu
            className="animate-in duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
            texte={contenu.texte}
            police={contenu.police}
            date={vocabulaire.date(contenu.ecrit_le)}
            signature={contenu.signature}
            sceau={exterieur.sceau}
            passages={contenu.passages_reecrits}
            policeReecriture={contenu.police_reecriture}
          />
          <p className="mt-3 text-sm text-muted-foreground">{mots.recu(arrive)}</p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="outline" className="h-11 min-w-28" onClick={() => setDemande('ranger')}>
              {mots.ranger}
            </Button>
            <Button
              variant="ghost"
              className="h-11 text-destructive hover:text-destructive"
              onClick={() => setDemande('detruire')}
            >
              {mots.detruire}
            </Button>
          </div>
        </>
      )}

      {erreur && (
        <p role="alert" className="mt-4 text-center text-destructive">
          {erreur}
        </p>
      )}

      {demande === 'ranger' && <ChoixDossier actuel={exterieur.dossier_id} surChoix={ranger} />}
      <Confirmation
        ouverte={demande === 'detruire'}
        titre={vocabulaire.reception.confirmerDestruction.titre(1)}
        texte={vocabulaire.reception.confirmerDestruction.texte(1)}
        action={vocabulaire.reception.confirmerDestruction.action}
        surReponse={detruire}
      />
    </>
  );
}

function Retour({ vers }: { vers: string }) {
  return (
    <Link
      to={vers}
      className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      {mots.retour}
    </Link>
  );
}
