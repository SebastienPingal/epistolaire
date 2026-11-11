/**
 * Les éléments partagés par les écrans du courrier du MJ :
 * À traiter, En route, et l'écriture au nom d'un PNJ.
 */
import type { VariantProps } from 'class-variance-authority';
import { type FormEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { appeler, messageErreur } from '@/api';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Cachet } from '@/composants/Cachet';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import { policeDe } from '@/theme/ecritures';
import type { BilletPnj } from '@/types/BilletPnj';
import type { EcritureMj } from '@/types/EcritureMj';
import type { NouveauPersonnage } from '@/types/NouveauPersonnage';
import type { PersonnageDetail } from '@/types/PersonnageDetail';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { SceauMj } from '@/types/SceauMj';
import type { SceauPose } from '@/types/SceauPose';

import { Champ } from './commun';

// ---------------------------------------------------------------------------
// Les dates
// ---------------------------------------------------------------------------

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** « mar. 10 nov. à 19:40 », à l'heure de l'appareil. */
export function dateLisible(iso: string): string {
  return FORMAT_DATE.format(new Date(iso)).replace(', ', ' à ');
}

/** « dans 3 h », « dans 2 j », « il y a 20 min ». */
export function delaiLisible(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  const absolu = Math.abs(minutes);
  const duree =
    absolu < 60
      ? `${absolu} min`
      : absolu < 48 * 60
        ? `${Math.round(absolu / 60)} h`
        : `${Math.round(absolu / (24 * 60))} j`;
  return minutes >= 0 ? `dans ${duree}` : `il y a ${duree}`;
}

/** Une date du serveur, mise au format d'un champ « date et heure » (heure de l'appareil). */
export function versChamp(date: Date | string): string {
  const instant = new Date(date);
  const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** La valeur d'un champ « date et heure », au format du serveur. Vide : pas de date. */
export function depuisChamp(valeur: string): string | null {
  if (valeur === '') return null;
  const instant = new Date(valeur);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** Dans combien de minutes arrive un pli validé après sa date proposée. */
export const MINUTES_DE_RATTRAPAGE = 10;

export const dansQuelquesMinutes = () => new Date(Date.now() + MINUTES_DE_RATTRAPAGE * 60_000);

// ---------------------------------------------------------------------------
// Un lien qui a l'allure d'un bouton
// ---------------------------------------------------------------------------

export function LienBouton({
  vers,
  variant,
  size,
  className,
  children,
}: { vers: string; className?: string; children: ReactNode } & VariantProps<
  typeof buttonVariants
>) {
  return (
    <Link to={vers} data-slot="button" className={cn(buttonVariants({ variant, size }), className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Une lettre, telle qu'elle est écrite
// ---------------------------------------------------------------------------

export function Lettre({
  texte,
  police,
  signature,
  sceau,
  tronquee = false,
  className,
}: {
  texte: string;
  police: string | null;
  /** Le nom tracé sous le texte. Vide : la lettre n'est pas signée. */
  signature: string | null;
  sceau: SceauPose | null;
  /** Dans une liste : seulement les premières lignes. */
  tronquee?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn('rounded-sm bg-card px-4 py-3 shadow-sm ring-1 ring-foreground/10', className)}
    >
      <p className={cn('text-lg break-words whitespace-pre-wrap', tronquee && 'line-clamp-3')}>
        <Main police={police}>{texte}</Main>
      </p>
      <div className="mt-2 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          {sceau ? (
            <>
              <Cachet initiales={sceau.initiales} nom={sceau.nom_grave} className="size-7" />
              Scellée : {sceau.nom_grave}
            </>
          ) : (
            'Sans sceau'
          )}
        </span>
        {signature ? (
          <Main police={police} className="ml-auto text-xl text-foreground">
            {signature}
          </Main>
        ) : (
          <span className="ml-auto">Non signée</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le choix d'un personnage
// ---------------------------------------------------------------------------

/** Le nom d'un personnage dans une liste du MJ : les PNJ sont signalés. */
export const nomEtGenre = (personnage: PersonnageResume) =>
  personnage.genre === 'pnj' ? `${personnage.nom} (PNJ)` : personnage.nom;

export function ChoixPersonnage({
  id,
  libelle,
  invite,
  personnages,
  valeur,
  surChoix,
  className,
}: {
  id?: string;
  /** Lu par les lecteurs d'écran. */
  libelle: string;
  invite: string;
  personnages: PersonnageResume[];
  valeur: string | null;
  surChoix: (id: string | null) => void;
  className?: string;
}) {
  const choix = personnages.map((personnage) => ({
    value: personnage.id,
    label: nomEtGenre(personnage),
  }));
  return (
    <Select items={choix} value={valeur} onValueChange={surChoix}>
      <SelectTrigger id={id} aria-label={libelle} className={cn('min-w-48', className)}>
        <SelectValue placeholder={invite} />
      </SelectTrigger>
      <SelectContent>
        {choix.map((personnage) => (
          <SelectItem key={personnage.value} value={personnage.value}>
            {personnage.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Créer un PNJ à la volée
// ---------------------------------------------------------------------------

export function NouveauPnj({
  ouvert,
  nomPropose = '',
  surFermeture,
}: {
  ouvert: boolean;
  /** Une adresse libre écrite par un joueur, par exemple. */
  nomPropose?: string;
  /** `null` : la fenêtre est fermée sans rien créer. */
  surFermeture: (cree: PersonnageDetail | null) => void;
}) {
  const [nom, setNom] = useState(nomPropose);
  const [creerSceau, setCreerSceau] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(evenement: FormEvent) {
    evenement.preventDefault();
    // Cette fenêtre vit dans un autre formulaire : lui seul ne doit pas partir.
    evenement.stopPropagation();
    setOccupe(true);
    setErreur(null);
    try {
      const cree = await appeler<PersonnageDetail>('/mj/personnages', {
        nom,
        genre: 'pnj',
        email: null,
        creer_sceau: creerSceau,
      } satisfies NouveauPersonnage);
      setNom('');
      surFermeture(cree);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(etat) => !etat && surFermeture(null)}>
      <DialogContent>
        <form onSubmit={creer} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nouveau PNJ</DialogTitle>
          </DialogHeader>
          <Champ
            libelle="Nom"
            pour="pnj-nom"
            aide="Sa fiche se complète plus tard, depuis l'écran Personnages."
          >
            <Input
              id="pnj-nom"
              required
              autoFocus
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </Champ>
          <div className="flex items-center gap-3">
            <Switch id="pnj-sceau" checked={creerSceau} onCheckedChange={setCreerSceau} />
            <Label htmlFor="pnj-sceau">Lui créer un sceau à son nom</Label>
          </div>
          {erreur && (
            <p role="alert" className="text-destructive">
              {erreur}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={occupe}>
              {occupe ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Le billet d'un PNJ
// ---------------------------------------------------------------------------

export const BILLET_VIERGE: BilletPnj = {
  ecriture_id: null,
  texte: '',
  signe: true,
  sceau_id: null,
  livraison_le: null,
};

/** Ce qui manque à un billet de PNJ pour partir, ou `null` s'il est prêt. */
export function manqueAuBillet(pnj: PersonnageResume, billet: BilletPnj): string | null {
  if (billet.texte.trim() === '') return 'Le billet est encore vide.';
  if (pnj.ecriture_id === null && billet.ecriture_id === null) {
    return `Choisissez l'écriture de ${pnj.nom}.`;
  }
  return null;
}

/**
 * Le billet que le MJ écrit au nom d'un PNJ : son écriture s'il n'en a pas encore,
 * le texte, la signature, le sceau et la date de livraison.
 */
export function ComposerBillet({
  pnj,
  personnages,
  ecritures,
  sceaux,
  longueur,
  billet,
  surBillet,
}: {
  pnj: PersonnageResume;
  /** Tous les personnages : ils disent quelles écritures sont déjà celles d'un joueur. */
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
  /** La longueur d'un billet de joueur. Le MJ peut la dépasser. */
  longueur: number;
  billet: BilletPnj;
  surBillet: (billet: BilletPnj) => void;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const changer = (changement: Partial<BilletPnj>) => surBillet({ ...billet, ...changement });

  const ecriture = ecritures.find((e) => e.id === (pnj.ecriture_id ?? billet.ecriture_id));
  const police = ecriture?.police ?? null;
  const { famille, echelle } = policeDe(police);
  const sesSceaux = sceaux.filter((sceau) => sceau.detenteur_id === pnj.id);
  const caracteres = [...billet.texte].length;

  // La feuille grandit avec le texte.
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [billet.texte, police]);

  return (
    <div className="grid gap-5">
      {pnj.ecriture_id === null && (
        <ChoixEcriturePnj
          nom={pnj.nom}
          personnages={personnages}
          ecritures={ecritures}
          choisie={billet.ecriture_id}
          surChoix={(ecriture_id) => changer({ ecriture_id })}
        />
      )}

      <div>
        <div className="overflow-hidden rounded-sm bg-card shadow-sm ring-1 ring-foreground/10">
          <div className="px-5 pt-5 pb-4">
            <textarea
              ref={zone}
              aria-label={`Billet de ${pnj.nom}`}
              placeholder="Écrivez ici…"
              rows={5}
              spellCheck
              className="block w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-muted-foreground/70"
              style={{ fontFamily: `${famille}, cursive`, fontSize: `${1.25 * echelle}rem` }}
              value={billet.texte}
              onChange={(e) => changer({ texte: e.target.value })}
            />
            {billet.signe && (
              <p className="mt-3 text-right text-xl">
                <Main police={police}>{pnj.nom}</Main>
              </p>
            )}
          </div>
        </div>
        <p
          className={cn(
            'mt-1.5 text-sm text-muted-foreground',
            caracteres > longueur && 'text-destructive',
          )}
        >
          {caracteres} / {longueur} caractères
          {caracteres > longueur && ' : plus long qu’un billet de joueur. Vous seul le pouvez.'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="billet-signer"
          checked={billet.signe}
          onCheckedChange={(signe) => changer({ signe })}
        />
        <Label htmlFor="billet-signer">Signer du nom de {pnj.nom}</Label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Sceller</legend>
        {sesSceaux.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {pnj.nom} ne détient aucun sceau : le pli partira sans sceau.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Pastille actif={billet.sceau_id === null} surChoix={() => changer({ sceau_id: null })}>
              Sans sceau
            </Pastille>
            {sesSceaux.map((sceau) => (
              <Pastille
                key={sceau.id}
                actif={billet.sceau_id === sceau.id}
                surChoix={() => changer({ sceau_id: sceau.id })}
              >
                <Cachet initiales={sceau.initiales} nom={sceau.nom_grave} className="size-7" />
                {sceau.nom_grave}
              </Pastille>
            ))}
          </div>
        )}
      </fieldset>

      <Champ
        libelle="Arrivée de ce billet"
        pour="billet-date"
        aide="Vide : le délai habituel, plus ou moins le hasard. La date reste modifiable dans En route."
      >
        <Input
          id="billet-date"
          type="datetime-local"
          className="max-w-64"
          value={billet.livraison_le ? versChamp(billet.livraison_le) : ''}
          onChange={(e) => changer({ livraison_le: depuisChamp(e.target.value) })}
        />
      </Champ>
    </div>
  );
}

/** Un choix parmi quelques-uns, sous forme de pastille à enfoncer. */
export function Pastille({
  actif,
  surChoix,
  className,
  children,
}: {
  actif: boolean;
  surChoix: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={surChoix}
      className={cn(
        'flex min-h-10 items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm ring-1 ring-foreground/10 outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring',
        actif && 'ring-2 ring-primary hover:ring-primary',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * L'écriture d'un PNJ qui n'en a pas encore. Les génériques viennent en premier ;
 * celles des joueurs ne sont pas proposées, pour que leur main reste un indice.
 */
function ChoixEcriturePnj({
  nom,
  personnages,
  ecritures,
  choisie,
  surChoix,
}: {
  nom: string;
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  choisie: string | null;
  surChoix: (ecritureId: string | null) => void;
}) {
  const prises = new Set(
    personnages.filter((p) => p.genre === 'joueur' && p.ecriture_id).map((p) => p.ecriture_id),
  );
  const proposees = ecritures
    .filter((ecriture) => !prises.has(ecriture.id))
    .sort((a, b) => Number(b.generique) - Number(a.generique));

  return (
    <fieldset>
      <legend className="text-sm font-medium">Écriture de {nom}</legend>
      <p className="mt-1 mb-2 text-sm text-muted-foreground">
        {nom} n'a pas encore d'écriture. Celle que vous choisissez ici restera la sienne.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {proposees.map((ecriture) => (
          <Pastille
            key={ecriture.id}
            actif={ecriture.id === choisie}
            surChoix={() => surChoix(ecriture.id === choisie ? null : ecriture.id)}
            className="min-h-16 flex-col items-start justify-between gap-1 text-left"
          >
            <Main police={ecriture.police} className="line-clamp-1 text-base">
              {nom}
            </Main>
            <span className="text-xs text-muted-foreground">
              {ecriture.nom}
              {ecriture.generique && ' · générique'}
              {ecriture.utilisee_par.length > 0 && ` · ${ecriture.utilisee_par.join(', ')}`}
            </span>
          </Pastille>
        ))}
      </div>
    </fieldset>
  );
}
