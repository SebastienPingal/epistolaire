import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { useLecture } from '@/outils/useLecture';
import type { BilletPnj } from '@/types/BilletPnj';
import type { EcritureMj } from '@/types/EcritureMj';
import type { LettrePnj } from '@/types/LettrePnj';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { Reglages } from '@/types/Reglages';
import type { SceauMj } from '@/types/SceauMj';

import { Attente, Champ, Entete, Section } from './commun';
import {
  BILLET_VIERGE,
  ChoixPersonnage,
  ComposerBillet,
  manqueAuBillet,
  NouveauPnj,
} from './courrier';

/** Écrire un billet au nom d'un PNJ. Il part aussitôt, sans passer par la file. */
export function Ecrire() {
  const naviguer = useNavigate();
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const ecritures = useLecture<EcritureMj[]>('/mj/ecritures');
  const sceaux = useLecture<SceauMj[]>('/mj/sceaux');
  const reglages = useLecture<Reglages>('/mj/reglages');

  const [auteurId, setAuteurId] = useState<string | null>(null);
  const [destinataireId, setDestinataireId] = useState<string | null>(null);
  const [billet, setBillet] = useState<BilletPnj>(BILLET_VIERGE);
  const [creation, setCreation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!personnages.donnees || !ecritures.donnees || !sceaux.donnees || !reglages.donnees) {
    return (
      <Attente
        erreur={personnages.erreur ?? ecritures.erreur ?? sceaux.erreur ?? reglages.erreur}
      />
    );
  }

  const pnj = personnages.donnees.filter((personnage) => personnage.genre === 'pnj');
  const auteur = pnj.find((personnage) => personnage.id === auteurId) ?? null;
  const manque = !auteur
    ? 'Choisissez au nom de qui vous écrivez.'
    : !destinataireId
      ? 'Choisissez à qui ce billet est adressé.'
      : manqueAuBillet(auteur, billet);

  async function envoyer() {
    if (!auteur || !destinataireId) return;
    setOccupe(true);
    setErreur(null);
    try {
      await appeler('/mj/lettres', {
        auteur_id: auteur.id,
        destinataire_id: destinataireId,
        billet,
      } satisfies LettrePnj);
      toast.success('Le pli est en route');
      naviguer('/mj/en-route');
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <>
      <Entete titre="Écrire au nom d'un PNJ" />
      <p className="mb-6 text-muted-foreground">
        Le billet part aussitôt et arrive comme les autres : pli fermé, dans la Réception du
        destinataire. Jusqu'à son arrivée, il reste modifiable dans En route.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ libelle="Au nom de" pour="auteur">
          <div className="flex flex-wrap gap-2">
            {pnj.length > 0 && (
              <ChoixPersonnage
                id="auteur"
                libelle="Au nom de"
                invite="Choisir un PNJ"
                personnages={pnj}
                valeur={auteurId}
                surChoix={(choisi) => {
                  setAuteurId(choisi);
                  // L'écriture et le sceau choisis étaient ceux du PNJ précédent.
                  setBillet((avant) => ({ ...avant, ecriture_id: null, sceau_id: null }));
                  if (choisi === destinataireId) setDestinataireId(null);
                }}
                className="flex-1"
              />
            )}
            <Button variant="outline" onClick={() => setCreation(true)}>
              <PlusIcon />
              Nouveau PNJ
            </Button>
          </div>
        </Champ>

        <Champ libelle="À" pour="destinataire">
          <ChoixPersonnage
            id="destinataire"
            libelle="Destinataire"
            invite="Choisir un personnage"
            personnages={personnages.donnees.filter((personnage) => personnage.id !== auteurId)}
            valeur={destinataireId}
            surChoix={setDestinataireId}
          />
        </Champ>
      </div>

      {auteur && (
        <Section titre="Le billet">
          <ComposerBillet
            pnj={auteur}
            personnages={personnages.donnees}
            ecritures={ecritures.donnees}
            sceaux={sceaux.donnees}
            longueur={reglages.donnees.longueur_billet}
            billet={billet}
            surBillet={setBillet}
          />
        </Section>
      )}

      <p role="status" className="mt-6 min-h-6 text-sm text-muted-foreground">
        {erreur ? <span className="text-destructive">{erreur}</span> : manque}
      </p>
      <div className="mt-2">
        <Button size="lg" disabled={occupe || manque !== null} onClick={envoyer}>
          Envoyer
        </Button>
      </div>

      <NouveauPnj
        ouvert={creation}
        surFermeture={async (cree) => {
          setCreation(false);
          if (!cree) return;
          await Promise.all([personnages.recharger(), sceaux.recharger()]);
          setAuteurId(cree.id);
          setBillet((avant) => ({ ...avant, ecriture_id: null, sceau_id: null }));
        }}
      />
    </>
  );
}
