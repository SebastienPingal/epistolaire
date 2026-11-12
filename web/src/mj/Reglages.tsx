import { XIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { CalendrierMj } from '@/types/CalendrierMj';
import type { NouveauBond } from '@/types/NouveauBond';
import type { Reglages as ReglagesServeur } from '@/types/Reglages';

import { Attente, Champ, Entete, Section } from './commun';
import { SectionNotificationsMj } from './Notifications';

export function Reglages() {
  const { donnees, erreur } = useLecture<ReglagesServeur>('/mj/reglages');
  const calendrier = useLecture<CalendrierMj>('/mj/reglages/calendrier');

  if (!donnees || !calendrier.donnees) return <Attente erreur={erreur ?? calendrier.erreur} />;
  return (
    <>
      <Formulaire reglages={donnees} surEnregistre={calendrier.recharger} />
      <TempsDuJeu calendrier={calendrier.donnees} recharger={calendrier.recharger} />
      <SectionNotificationsMj />
    </>
  );
}

/** Le serveur compte en minutes ; le MJ, lui, pense en heures. */
const enHeures = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100);
const enMinutes = (heures: string) => Math.round(Number(heures.replace(',', '.')) * 60);

function Formulaire({
  reglages,
  surEnregistre,
}: {
  reglages: ReglagesServeur;
  surEnregistre: () => Promise<void>;
}) {
  const [saisie, setSaisie] = useState({
    longueur: String(reglages.longueur_billet),
    quota: String(reglages.quota_hebdo),
    delai: enHeures(reglages.delai_minutes),
    hasard: enHeures(reglages.hasard_minutes),
    debut: reglages.calendrier_debut,
  });
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changer = (cle: keyof typeof saisie, valeur: string) =>
    setSaisie((avant) => ({ ...avant, [cle]: valeur }));

  async function enregistrer(evenement: FormEvent) {
    evenement.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await modifier('/mj/reglages', {
        longueur_billet: Number(saisie.longueur),
        quota_hebdo: Number(saisie.quota),
        delai_minutes: enMinutes(saisie.delai),
        hasard_minutes: enMinutes(saisie.hasard),
        calendrier_debut: saisie.debut,
      } satisfies ReglagesServeur);
      toast.success('Enregistré');
      await surEnregistre();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <form onSubmit={enregistrer}>
      <Entete titre="Réglages" />
      <p className="mb-6 text-muted-foreground">
        Les joueurs ne voient aucun de ces chiffres : ils n'en voient que les effets.
      </p>

      <Section titre="Écrire">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Longueur d'un billet" pour="longueur" aide="En caractères.">
            <Input
              id="longueur"
              type="number"
              min={1}
              required
              inputMode="numeric"
              value={saisie.longueur}
              onChange={(e) => changer('longueur', e.target.value)}
            />
          </Champ>
          <Champ
            libelle="Lettres par semaine"
            pour="quota"
            aide="Par joueur. Le compte repart de zéro chaque lundi à minuit, heure de Paris."
          >
            <Input
              id="quota"
              type="number"
              min={0}
              required
              inputMode="numeric"
              value={saisie.quota}
              onChange={(e) => changer('quota', e.target.value)}
            />
          </Champ>
        </div>
      </Section>

      <Section
        titre="Acheminer"
        aide="Le site propose une date de livraison : l'envoi, plus le délai, plus ou moins le hasard. Vous restez libre de la changer pour chaque pli."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ libelle="Délai de livraison" pour="delai" aide="En heures.">
            <Input
              id="delai"
              type="number"
              min={0}
              step="any"
              required
              inputMode="decimal"
              value={saisie.delai}
              onChange={(e) => changer('delai', e.target.value)}
            />
          </Champ>
          <Champ libelle="Part de hasard" pour="hasard" aide="En heures, en plus ou en moins.">
            <Input
              id="hasard"
              type="number"
              min={0}
              step="any"
              required
              inputMode="decimal"
              value={saisie.hasard}
              onChange={(e) => changer('hasard', e.target.value)}
            />
          </Champ>
        </div>
      </Section>

      <Section
        titre="Calendrier du jeu"
        aide="Un jour réel vaut un jour de jeu. Le jour change à minuit, heure de Paris."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            libelle="Premier jour du jeu"
            pour="debut"
            aide="Le jour réel qui vaut le « 1er jour du 1er mois, an 1 »."
          >
            <Input
              id="debut"
              type="date"
              required
              value={saisie.debut}
              onChange={(e) => changer('debut', e.target.value)}
            />
          </Champ>
        </div>
      </Section>

      {erreur && (
        <p role="alert" className="mt-6 text-destructive">
          {erreur}
        </p>
      )}

      <div className="mt-8">
        <Button type="submit" size="lg" disabled={occupe}>
          {occupe ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** « mardi 12 novembre 2026 », pour un jour sans heure. */
const jourLisible = (jour: string) => FORMAT_JOUR.format(new Date(`${jour}T12:00:00`));

/** La date du jeu d'aujourd'hui, et les bonds dans le temps. */
function TempsDuJeu({
  calendrier,
  recharger,
}: {
  calendrier: CalendrierMj;
  recharger: () => Promise<void>;
}) {
  const [saisie, setSaisie] = useState({ depuis: calendrier.jour_reel, jours: '', note: '' });
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function ajouter(evenement: FormEvent) {
    evenement.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await appeler('/mj/reglages/bonds', {
        a_partir_du: saisie.depuis,
        jours: Number(saisie.jours),
        note: saisie.note,
      } satisfies NouveauBond);
      setSaisie({ depuis: calendrier.jour_reel, jours: '', note: '' });
      toast.success('Bond ajouté');
      await recharger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function retirer(id: string) {
    try {
      await supprimer(`/mj/reglages/bonds/${id}`);
      await recharger();
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <Section
      titre="Le temps du jeu"
      aide="Un bond fait avancer le calendrier d'un coup, à partir du jour choisi. Les plis reçus avant gardent leur date."
    >
      <p className="mb-4 rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
        Aujourd'hui dans le jeu :{' '}
        <strong className="font-serif font-normal">
          {vocabulaire.date(calendrier.aujourd_hui)}
        </strong>
      </p>

      {calendrier.bonds.length > 0 && (
        <ul className="mb-6 divide-y rounded-lg ring-1 ring-foreground/10">
          {calendrier.bonds.map((bond) => (
            <li key={bond.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {bond.jours} jour{Math.abs(bond.jours) > 1 ? 's' : ''}
                </span>{' '}
                <span className="text-muted-foreground">
                  à partir du {jourLisible(bond.a_partir_du)}
                </span>
                {bond.note && <span className="block text-sm">{bond.note}</span>}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Retirer ce bond"
                onClick={() => void retirer(bond.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={ajouter} className="grid gap-4 sm:grid-cols-[auto_8rem_1fr_auto] sm:items-end">
        <Champ libelle="À partir du" pour="bond-depuis">
          <Input
            id="bond-depuis"
            type="date"
            required
            value={saisie.depuis}
            onChange={(e) => setSaisie((avant) => ({ ...avant, depuis: e.target.value }))}
          />
        </Champ>
        <Champ libelle="Jours" pour="bond-jours">
          <Input
            id="bond-jours"
            type="number"
            min={1}
            required
            inputMode="numeric"
            value={saisie.jours}
            onChange={(e) => setSaisie((avant) => ({ ...avant, jours: e.target.value }))}
          />
        </Champ>
        <Champ libelle="Note (facultatif)" pour="bond-note">
          <Input
            id="bond-note"
            maxLength={200}
            value={saisie.note}
            onChange={(e) => setSaisie((avant) => ({ ...avant, note: e.target.value }))}
          />
        </Champ>
        <Button type="submit" disabled={occupe}>
          Ajouter le bond
        </Button>
      </form>
      {erreur && (
        <p role="alert" className="mt-4 text-destructive">
          {erreur}
        </p>
      )}
    </Section>
  );
}
