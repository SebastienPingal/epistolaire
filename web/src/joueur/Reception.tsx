import { FolderPlusIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
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
import { Attente } from '@/composants/Attente';
import { Confirmation } from '@/composants/Confirmation';
import { cn } from '@/lib/utils';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { ContenuDossier } from '@/types/ContenuDossier';
import type { Destruction } from '@/types/Destruction';
import type { Dossier } from '@/types/Dossier';
import type { DossierSaisi } from '@/types/DossierSaisi';
import type { PliFerme } from '@/types/PliFerme';
import type { Rangement } from '@/types/Rangement';
import type { Reception as ReceptionServeur } from '@/types/Reception';

import { ChoixDossier, LignePli } from './rangement';

const mots = vocabulaire.reception;
const motsDossiers = vocabulaire.dossiers;

/** La Réception : tout le courrier arrive ici, fermé, le plus récent en premier. */
export function Reception() {
  const { donnees, erreur, recharger } = useLecture<ReceptionServeur>('/joueur/reception');

  if (!donnees) {
    return (
      <>
        <h1 className="mb-6 font-serif text-2xl">{mots.titre}</h1>
        <Attente erreur={erreur} />
      </>
    );
  }
  return (
    <Courrier
      plis={donnees.plis}
      dossiers={donnees.dossiers}
      dossier={null}
      recharger={recharger}
    />
  );
}

/** Un dossier du joueur. */
export function DossierJoueur() {
  const { id } = useParams();
  const reception = useLecture<ReceptionServeur>('/joueur/reception');
  const contenu = useLecture<ContenuDossier>(`/joueur/dossiers/${id}`);

  if (!reception.donnees || !contenu.donnees) {
    return <Attente erreur={contenu.erreur ?? reception.erreur} />;
  }
  return (
    <Courrier
      key={id}
      plis={contenu.donnees.plis}
      dossiers={reception.donnees.dossiers}
      dossier={contenu.donnees.dossier}
      recharger={async () => {
        await Promise.all([reception.recharger(), contenu.recharger()]);
      }}
    />
  );
}

type Demande = 'ranger' | 'detruire' | 'nouveau' | 'renommer' | 'supprimer';

/** Une liste de plis, la Réception ou un dossier, avec les gestes de rangement. */
function Courrier({
  plis,
  dossiers,
  dossier,
  recharger,
}: {
  plis: PliFerme[];
  dossiers: Dossier[];
  /** `null` : la Réception. */
  dossier: Dossier | null;
  recharger: () => Promise<void>;
}) {
  const naviguer = useNavigate();
  const { pathname } = useLocation();
  // `null` : pas en mode choix.
  const [choisis, setChoisis] = useState<Set<string> | null>(null);
  const [demande, setDemande] = useState<Demande | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const enChoix = choisis !== null;
  const nombreChoisis = choisis?.size ?? 0;
  const liste = [...(choisis ?? [])];

  function basculer(id: string) {
    setChoisis((avant) => {
      const suivant = new Set(avant);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });
  }

  async function ranger(destination: { id: string | null; nom: string } | undefined) {
    setDemande(null);
    if (!destination) return;
    try {
      await modifier('/joueur/rangement', {
        plis: liste,
        dossier_id: destination.id,
      } satisfies Rangement);
      toast.success(mots.ranges(liste.length, destination.nom));
      setChoisis(null);
      await recharger();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  async function detruire(confirme: boolean) {
    setDemande(null);
    if (!confirme) return;
    try {
      await appeler('/joueur/destruction', { plis: liste } satisfies Destruction);
      toast.success(mots.detruits(liste.length));
      setChoisis(null);
      await recharger();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  async function supprimerDossier(confirme: boolean) {
    setDemande(null);
    if (!confirme || !dossier) return;
    try {
      await supprimer(`/joueur/dossiers/${dossier.id}`);
      toast.success(motsDossiers.supprime);
      naviguer('/reception');
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 font-serif text-2xl break-words">
          {dossier ? dossier.nom : mots.titre}
        </h1>
        {plis.length > 0 && (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => setChoisis(enChoix ? null : new Set())}
          >
            {enChoix ? mots.terminer : mots.choisir}
          </Button>
        )}
      </div>

      <nav aria-label={motsDossiers.lieux} className="mb-5 flex flex-wrap gap-2">
        <Lieu vers="/reception" actif={dossier === null}>
          {mots.titre}
        </Lieu>
        {dossiers.map((autre) => (
          <Lieu
            key={autre.id}
            vers={`/dossiers/${autre.id}`}
            actif={dossier?.id === autre.id}
            nombre={autre.nombre}
          >
            {autre.nom}
          </Lieu>
        ))}
        <button
          type="button"
          onClick={() => setDemande('nouveau')}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-foreground/25 px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FolderPlusIcon className="size-4" />
          {motsDossiers.nouveau}
        </button>
      </nav>

      {dossier && !enChoix && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => setDemande('renommer')}>
            {motsDossiers.renommer}
          </Button>
          <Button
            variant="ghost"
            className="h-11 text-destructive hover:text-destructive"
            onClick={() => setDemande('supprimer')}
          >
            {motsDossiers.supprimer}
          </Button>
        </div>
      )}

      {erreur && (
        <p role="alert" className="mb-4 text-destructive">
          {erreur}
        </p>
      )}

      {plis.length === 0 ? (
        <p className="text-muted-foreground">{dossier ? mots.dossierVide : mots.vide}</p>
      ) : (
        <ul className="grid gap-1">
          {plis.map((pli) => (
            <LignePli
              key={pli.id}
              pli={pli}
              retour={pathname}
              choisi={enChoix ? choisis.has(pli.id) : undefined}
              surChoix={() => basculer(pli.id)}
            />
          ))}
        </ul>
      )}

      {enChoix && (
        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] mt-6 flex flex-wrap items-center gap-2 rounded-lg bg-popover p-2 shadow-md ring-1 ring-foreground/10 md:bottom-4">
          <p role="status" className="min-w-0 flex-1 px-2 text-sm">
            {mots.choisis(nombreChoisis)}
          </p>
          <Button
            variant="outline"
            className="h-11"
            disabled={nombreChoisis === 0}
            onClick={() => setDemande('ranger')}
          >
            {mots.ranger}
          </Button>
          <Button
            variant="destructive"
            className="h-11"
            disabled={nombreChoisis === 0}
            onClick={() => setDemande('detruire')}
          >
            {mots.detruire}
          </Button>
        </div>
      )}

      {demande === 'ranger' && <ChoixDossier actuel={dossier?.id ?? null} surChoix={ranger} />}
      <Confirmation
        ouverte={demande === 'detruire'}
        titre={mots.confirmerDestruction.titre(nombreChoisis)}
        texte={mots.confirmerDestruction.texte(nombreChoisis)}
        action={mots.confirmerDestruction.action}
        surReponse={detruire}
      />
      {dossier && (
        <Confirmation
          ouverte={demande === 'supprimer'}
          titre={motsDossiers.confirmerSuppression.titre(dossier.nom)}
          texte={motsDossiers.confirmerSuppression.texte(dossier.nombre)}
          action={motsDossiers.confirmerSuppression.action}
          destructrice={dossier.nombre > 0}
          surReponse={supprimerDossier}
        />
      )}
      {(demande === 'nouveau' || demande === 'renommer') && (
        <NomDeDossier
          dossier={demande === 'renommer' ? dossier : null}
          surFin={async (cree) => {
            setDemande(null);
            if (cree) {
              await recharger();
              if (demande === 'nouveau') naviguer(`/dossiers/${cree.id}`);
            }
          }}
        />
      )}
    </>
  );
}

/** Une destination de la rangée Réception / dossiers. */
function Lieu({
  vers,
  actif,
  nombre = 0,
  children,
}: {
  vers: string;
  actif: boolean;
  /** Le nombre de plis rangés là. */
  nombre?: number;
  children: ReactNode;
}) {
  return (
    <Link
      to={vers}
      aria-current={actif ? 'page' : undefined}
      className={cn(
        'inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full bg-card px-3.5 text-sm ring-1 ring-foreground/15 outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring',
        actif && 'bg-primary text-primary-foreground ring-primary hover:ring-primary',
      )}
    >
      <span className="truncate">{children}</span>
      {nombre > 0 && (
        <span
          className={cn(
            'tabular-nums',
            actif ? 'text-primary-foreground/70' : 'text-muted-foreground',
          )}
        >
          {nombre}
        </span>
      )}
    </Link>
  );
}

/** Créer un dossier, ou renommer celui-ci. */
function NomDeDossier({
  dossier,
  surFin,
}: {
  /** `null` : un nouveau dossier. */
  dossier: Dossier | null;
  /** Le dossier créé ou renommé, ou `null` si on a renoncé. */
  surFin: (dossier: Dossier | null) => void;
}) {
  const [nom, setNom] = useState(dossier?.nom ?? '');
  const [erreur, setErreur] = useState<string | null>(null);

  async function valider(evenement: FormEvent) {
    evenement.preventDefault();
    try {
      const saisie = { nom: nom.trim() } satisfies DossierSaisi;
      surFin(
        dossier
          ? await modifier<Dossier>(`/joueur/dossiers/${dossier.id}`, saisie)
          : await appeler<Dossier>('/joueur/dossiers', saisie),
      );
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && surFin(null)}>
      <DialogContent>
        <form onSubmit={valider} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{dossier ? motsDossiers.renommer : motsDossiers.nouveau}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label={motsDossiers.nom}
            placeholder={motsDossiers.nom}
            maxLength={60}
            autoFocus
            value={nom}
            onChange={(e) => setNom(e.target.value)}
          />
          {erreur && (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={nom.trim() === ''}>
              {dossier ? motsDossiers.enregistrer : motsDossiers.creer}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
