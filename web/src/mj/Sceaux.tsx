import { PlusIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Cachet } from '@/composants/Cachet';
import { useLecture } from '@/outils/useLecture';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { SceauMj } from '@/types/SceauMj';
import type { SceauSaisi } from '@/types/SceauSaisi';

import { Attente, Champ, Confirmation, Entete } from './commun';
import { initialesDe } from './Personnage';

/** La valeur du choix « personne ne le détient ». */
const PERSONNE = 'personne';

type Choix = { value: string; label: string };

export function Sceaux() {
  const { donnees, erreur, recharger } = useLecture<SceauMj[]>('/mj/sceaux');
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const [creation, setCreation] = useState(false);
  const [aSupprimer, setASupprimer] = useState<SceauMj | null>(null);

  if (!donnees || !personnages.donnees) {
    return <Attente erreur={erreur ?? personnages.erreur} />;
  }

  const detenteurs: Choix[] = [
    { value: PERSONNE, label: 'Personne' },
    ...personnages.donnees.map((personnage) => ({ value: personnage.id, label: personnage.nom })),
  ];

  async function enregistrer(sceau: SceauMj, changement: Partial<SceauSaisi>) {
    try {
      await modifier(`/mj/sceaux/${sceau.id}`, {
        nom_grave: sceau.nom_grave,
        initiales: sceau.initiales,
        detenteur_id: sceau.detenteur_id,
        ...changement,
      } satisfies SceauSaisi);
    } catch (e) {
      toast.error(messageErreur(e));
    }
    await recharger();
  }

  async function repondre(confirme: boolean) {
    const sceau = aSupprimer;
    setASupprimer(null);
    if (!confirme || !sceau) return;
    try {
      await supprimer(`/mj/sceaux/${sceau.id}`);
    } catch (e) {
      toast.error(messageErreur(e));
    }
    await recharger();
  }

  return (
    <>
      <Entete titre="Sceaux">
        <Button onClick={() => setCreation(true)}>
          <PlusIcon />
          Nouveau sceau
        </Button>
      </Entete>
      <p className="mb-6 text-muted-foreground">
        Un sceau est un objet : vous pouvez le confier, le retirer ou le faire changer de mains. Son
        nom gravé reste celui de son propriétaire d'origine.
      </p>

      {donnees.length === 0 ? (
        <p className="text-muted-foreground">Aucun sceau pour l'instant.</p>
      ) : (
        <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
          {donnees.map((sceau) => (
            <li key={sceau.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Cachet initiales={sceau.initiales} nom={sceau.nom_grave} />
              <div className="grid min-w-40 flex-1 grid-cols-[1fr_4.5rem] gap-2">
                <Input
                  aria-label="Nom gravé"
                  key={`nom-${sceau.nom_grave}`}
                  defaultValue={sceau.nom_grave}
                  onBlur={(e) => {
                    const nom = e.target.value.trim();
                    if (nom !== '' && nom !== sceau.nom_grave) {
                      void enregistrer(sceau, { nom_grave: nom });
                    }
                  }}
                />
                <Input
                  aria-label="Initiales"
                  maxLength={3}
                  key={`initiales-${sceau.initiales}`}
                  defaultValue={sceau.initiales}
                  onBlur={(e) => {
                    const initiales = e.target.value.trim();
                    if (initiales !== sceau.initiales) void enregistrer(sceau, { initiales });
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Détenu par</span>
                <Select
                  items={detenteurs}
                  value={sceau.detenteur_id ?? PERSONNE}
                  onValueChange={(valeur) =>
                    enregistrer(sceau, { detenteur_id: valeur === PERSONNE ? null : valeur })
                  }
                >
                  <SelectTrigger aria-label={`Détenteur du sceau ${sceau.nom_grave}`} className="min-w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {detenteurs.map((choix) => (
                      <SelectItem key={choix.value} value={choix.value}>
                        {choix.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Supprimer le sceau ${sceau.nom_grave}`}
                  onClick={() => setASupprimer(sceau)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Creation
        ouverte={creation}
        detenteurs={detenteurs}
        surFermeture={async (cree) => {
          setCreation(false);
          if (cree) await recharger();
        }}
      />
      <Confirmation
        ouverte={aSupprimer !== null}
        titre={`Supprimer le sceau ${aSupprimer?.nom_grave ?? ''} ?`}
        texte="Un sceau qui a déjà fermé un pli ne peut pas être supprimé : retirez-le plutôt à son détenteur."
        action="Supprimer"
        surReponse={repondre}
      />
    </>
  );
}

function Creation({
  ouverte,
  detenteurs,
  surFermeture,
}: {
  ouverte: boolean;
  detenteurs: Choix[];
  surFermeture: (cree: boolean) => void;
}) {
  const [nom, setNom] = useState('');
  const [initiales, setInitiales] = useState('');
  const [initialesSaisies, setInitialesSaisies] = useState(false);
  const [detenteur, setDetenteur] = useState(PERSONNE);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(evenement: FormEvent) {
    evenement.preventDefault();
    setErreur(null);
    try {
      await appeler('/mj/sceaux', {
        nom_grave: nom,
        initiales,
        detenteur_id: detenteur === PERSONNE ? null : detenteur,
      } satisfies SceauSaisi);
      setNom('');
      setInitiales('');
      setInitialesSaisies(false);
      setDetenteur(PERSONNE);
      surFermeture(true);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <Dialog open={ouverte} onOpenChange={(ouvert) => !ouvert && surFermeture(false)}>
      <DialogContent>
        <form onSubmit={creer} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nouveau sceau</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-4">
            <Cachet initiales={initiales} nom={nom || 'nouveau sceau'} className="size-16" />
            <div className="grid flex-1 gap-3">
              <Champ libelle="Nom gravé" pour="sceau-nom">
                <Input
                  id="sceau-nom"
                  required
                  autoFocus
                  value={nom}
                  onChange={(e) => {
                    setNom(e.target.value);
                    // Les initiales suivent le nom tant qu'on ne les a pas saisies soi-même.
                    if (!initialesSaisies) setInitiales(initialesDe(e.target.value));
                  }}
                />
              </Champ>
              <Champ libelle="Initiales" pour="sceau-initiales">
                <Input
                  id="sceau-initiales"
                  maxLength={3}
                  className="max-w-24"
                  value={initiales}
                  onChange={(e) => {
                    setInitiales(e.target.value);
                    setInitialesSaisies(true);
                  }}
                />
              </Champ>
            </div>
          </div>

          <Champ
            libelle="Premier détenteur"
            pour="sceau-detenteur"
            aide="Il en sera le propriétaire d'origine."
          >
            <Select items={detenteurs} value={detenteur} onValueChange={(v) => setDetenteur(v ?? PERSONNE)}>
              <SelectTrigger id="sceau-detenteur" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {detenteurs.map((choix) => (
                  <SelectItem key={choix.value} value={choix.value}>
                    {choix.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Champ>

          {erreur && (
            <p role="alert" className="text-destructive">
              {erreur}
            </p>
          )}

          <DialogFooter>
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
