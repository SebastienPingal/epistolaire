/**
 * Les éléments partagés par la Réception, les dossiers et la lecture d'un pli :
 * un pli dans une liste, et le choix de l'endroit où ranger.
 */
import { CheckIcon, FolderIcon, InboxIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Link } from 'react-router';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Attente } from '@/composants/Attente';
import { Cachet } from '@/composants/Cachet';
import { Enveloppe, Pliure } from '@/composants/Enveloppe';
import { cn } from '@/lib/utils';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { Dossier } from '@/types/Dossier';
import type { DossierSaisi } from '@/types/DossierSaisi';
import type { PliFerme } from '@/types/PliFerme';
import type { Reception } from '@/types/Reception';

const mots = vocabulaire.reception;

// ---------------------------------------------------------------------------
// Un pli dans une liste
// ---------------------------------------------------------------------------

/**
 * Un pli de la Réception ou d'un dossier : une petite enveloppe, sa date d'arrivée,
 * et, une fois ouvert, de quoi le reconnaître.
 *
 * En mode choix, toucher le pli le choisit au lieu de l'ouvrir.
 */
export function LignePli({
  pli,
  retour,
  choisi,
  surChoix,
}: {
  pli: PliFerme;
  /** L'écran où revenir après la lecture. */
  retour: string;
  /** `undefined` : pas en mode choix. */
  choisi?: boolean;
  surChoix?: () => void;
}) {
  const contenu = (
    <>
      <Enveloppe ouverte={pli.ouvert} className="w-16 shrink-0">
        {pli.sceau ? (
          <Cachet
            initiales={pli.sceau.initiales}
            nom={pli.sceau.nom}
            etat={pli.sceau.etat}
            className="size-6"
          />
        ) : (
          <Pliure className="size-5" />
        )}
      </Enveloppe>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted-foreground">
          {mots.arrive(vocabulaire.date(pli.arrive_le))}
        </span>
        <span
          className={cn(
            'block truncate',
            !pli.ouvert && 'font-medium',
            pli.ouvert && !pli.signature && 'text-muted-foreground italic',
          )}
        >
          {pli.ouvert ? (pli.signature ?? pli.debut ?? mots.anonyme) : mots.nonOuvert}
        </span>
      </span>
      {choisi !== undefined ? (
        <span
          aria-hidden
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/30',
            choisi && 'bg-primary text-primary-foreground ring-primary',
          )}
        >
          {choisi && <CheckIcon className="size-4" />}
        </span>
      ) : (
        !pli.ouvert && (
          <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-sceau" />
        )
      )}
    </>
  );

  const allure =
    'flex min-h-16 w-full items-center gap-4 rounded-sm px-3 py-2.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <li data-pli={pli.id}>
      {choisi !== undefined ? (
        <button
          type="button"
          aria-pressed={choisi}
          className={cn(allure, choisi && 'bg-accent')}
          onClick={surChoix}
        >
          {contenu}
        </button>
      ) : (
        <Link to={`/pli/${pli.id}`} state={{ retour }} className={allure}>
          {contenu}
        </Link>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Le choix d'un endroit où ranger
// ---------------------------------------------------------------------------

/**
 * La fenêtre « Ranger » : la Réception, les dossiers du joueur, ou un nouveau dossier.
 * `surChoix(undefined)` : fermée sans rien choisir. `null` : la Réception.
 */
export function ChoixDossier({
  actuel,
  surChoix,
}: {
  /** Là où se trouvent les plis. Il n'est pas proposé. `undefined` : plusieurs endroits. */
  actuel?: string | null;
  surChoix: (destination: { id: string | null; nom: string } | undefined) => void;
}) {
  const reception = useLecture<Reception>('/joueur/reception');
  const [nom, setNom] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(evenement: FormEvent) {
    evenement.preventDefault();
    try {
      const dossier = await appeler<Dossier>('/joueur/dossiers', {
        nom: nom.trim(),
      } satisfies DossierSaisi);
      surChoix({ id: dossier.id, nom: dossier.nom });
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <Dialog open onOpenChange={(ouvert) => !ouvert && surChoix(undefined)}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vocabulaire.dossiers.lieux}</DialogTitle>
        </DialogHeader>

        {!reception.donnees ? (
          <Attente erreur={reception.erreur} />
        ) : (
          <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
            <Destination
              icone={<InboxIcon className="size-4" />}
              actuelle={actuel === null}
              surChoix={() => surChoix({ id: null, nom: mots.titre })}
            >
              {mots.titre}
            </Destination>
            {reception.donnees.dossiers.map((dossier) => (
              <Destination
                key={dossier.id}
                icone={<FolderIcon className="size-4" />}
                actuelle={actuel === dossier.id}
                surChoix={() => surChoix({ id: dossier.id, nom: dossier.nom })}
              >
                {dossier.nom}
              </Destination>
            ))}
          </ul>
        )}

        <form onSubmit={creer} className="grid gap-1.5">
          <Label htmlFor="nouveau-dossier">{vocabulaire.dossiers.nouveau}</Label>
          <div className="flex gap-2">
            <Input
              id="nouveau-dossier"
              maxLength={60}
              placeholder={vocabulaire.dossiers.nom}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={nom.trim() === ''}>
              {vocabulaire.dossiers.creer}
            </Button>
          </div>
          {erreur && (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Destination({
  icone,
  actuelle,
  surChoix,
  children,
}: {
  icone: ReactNode;
  actuelle: boolean;
  surChoix: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        disabled={actuelle}
        onClick={surChoix}
        className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:text-muted-foreground disabled:hover:bg-transparent"
      >
        {icone}
        <span className="min-w-0 flex-1 truncate">{children}</span>
      </button>
    </li>
  );
}
