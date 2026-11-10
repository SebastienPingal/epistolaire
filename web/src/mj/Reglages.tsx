import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { messageErreur, modifier } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLecture } from '@/outils/useLecture';
import type { Reglages as ReglagesServeur } from '@/types/Reglages';

import { Attente, Champ, Entete, Section } from './commun';

export function Reglages() {
  const { donnees, erreur } = useLecture<ReglagesServeur>('/mj/reglages');

  if (!donnees) return <Attente erreur={erreur} />;
  return <Formulaire reglages={donnees} />;
}

/** Le serveur compte en minutes ; le MJ, lui, pense en heures. */
const enHeures = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100);
const enMinutes = (heures: string) => Math.round(Number(heures.replace(',', '.')) * 60);

function Formulaire({ reglages }: { reglages: ReglagesServeur }) {
  const [saisie, setSaisie] = useState({
    longueur: String(reglages.longueur_billet),
    quota: String(reglages.quota_hebdo),
    delai: enHeures(reglages.delai_minutes),
    hasard: enHeures(reglages.hasard_minutes),
    debut: reglages.calendrier_debut,
    bonds: String(reglages.calendrier_bonds),
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
        calendrier_bonds: Number(saisie.bonds),
      } satisfies ReglagesServeur);
      toast.success('Enregistré');
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

      <Section titre="Calendrier du jeu" aide="Un jour réel vaut un jour de jeu.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            libelle="Premier jour du jeu"
            pour="debut"
            aide="Le jour réel qui vaut le premier jour du calendrier."
          >
            <Input
              id="debut"
              type="date"
              required
              value={saisie.debut}
              onChange={(e) => changer('debut', e.target.value)}
            />
          </Champ>
          <Champ
            libelle="Bonds dans le temps"
            pour="bonds"
            aide="Jours de jeu ajoutés d'un coup, au total."
          >
            <Input
              id="bonds"
              type="number"
              required
              inputMode="numeric"
              value={saisie.bonds}
              onChange={(e) => changer('bonds', e.target.value)}
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
