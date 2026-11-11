import { useState } from 'react';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useLecture } from '@/outils/useLecture';
import type { Acheminement } from '@/types/Acheminement';
import type { CopiePourTiers } from '@/types/CopiePourTiers';
import type { EnRoute as EnRouteServeur } from '@/types/EnRoute';
import type { ExemplaireMj } from '@/types/ExemplaireMj';
import type { ExemplaireModifie } from '@/types/ExemplaireModifie';
import type { PersonnageResume } from '@/types/PersonnageResume';

import { Attente, Champ, Entete, Section } from './commun';
import {
  ChoixPersonnage,
  dansQuelquesMinutes,
  dateLisible,
  delaiLisible,
  depuisChamp,
  Lettre,
  Pastille,
  versChamp,
} from './courrier';

const SORTS: { valeur: Acheminement; libelle: string }[] = [
  { valeur: 'en_route', libelle: 'En route' },
  { valeur: 'retenu', libelle: 'Retenu' },
  { valeur: 'perdu', libelle: 'Perdu' },
];

/** Les plis qui ne sont pas encore arrivés : ils restent modifiables jusqu'à leur livraison. */
export function EnRoute() {
  const { donnees, erreur, recharger } = useLecture<EnRouteServeur>('/mj/en-route');
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const [ouvert, setOuvert] = useState<ExemplaireMj | null>(null);

  if (!donnees || !personnages.donnees) {
    return <Attente erreur={erreur ?? personnages.erreur} />;
  }

  const liste = (exemplaires: ExemplaireMj[]) => (
    <ul className="grid gap-4">
      {exemplaires.map((exemplaire) => (
        <Ligne key={exemplaire.id} exemplaire={exemplaire} surOuverture={setOuvert} />
      ))}
    </ul>
  );

  return (
    <>
      <Entete titre="En route" />
      <p className="mb-6 text-muted-foreground">
        Un pli arrive tout seul à sa date. D'ici là, vous pouvez changer sa date ou son destinataire,
        le retenir, le perdre, ou en faire partir une copie.
      </p>

      {donnees.en_route.length === 0 ? (
        <p className="text-muted-foreground">Aucun pli n'est en chemin.</p>
      ) : (
        liste(donnees.en_route)
      )}

      {donnees.retenus.length > 0 && (
        <Section titre="Retenus" aide="Ils attendent que vous les remettiez en route.">
          {liste(donnees.retenus)}
        </Section>
      )}

      {donnees.perdus.length > 0 && (
        <Section titre="Perdus" aide="Ils n'arriveront pas, sauf si vous les retrouvez.">
          {liste(donnees.perdus)}
        </Section>
      )}

      {ouvert && (
        <Modification
          // La clé remet la fenêtre à neuf quand on change de pli.
          key={ouvert.id}
          exemplaire={ouvert}
          personnages={personnages.donnees}
          surFermeture={async (change) => {
            setOuvert(null);
            if (change) await recharger();
          }}
        />
      )}
    </>
  );
}

function titreDe(exemplaire: ExemplaireMj): string {
  return `${exemplaire.auteur_nom ?? 'Sans auteur'} à ${exemplaire.destinataire_nom}`;
}

function Ligne({
  exemplaire,
  surOuverture,
}: {
  exemplaire: ExemplaireMj;
  surOuverture: (exemplaire: ExemplaireMj) => void;
}) {
  const { acheminement, livraison_le: date } = exemplaire;
  return (
    <li className="rounded-xl bg-background p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="font-medium text-balance">{titreDe(exemplaire)}</h3>
        {exemplaire.origine === 'redirection' && <Badge variant="secondary">Redirigé</Badge>}
        {exemplaire.origine === 'copie' && <Badge variant="secondary">Copie</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {acheminement === 'en_route' && date && `Arrive ${dateLisible(date)} (${delaiLisible(date)})`}
        {acheminement === 'retenu' &&
          (date ? `Retenu · devait arriver ${dateLisible(date)}` : 'Retenu')}
        {acheminement === 'perdu' && 'Perdu'}
      </p>
      <Lettre
        className="mt-3"
        texte={exemplaire.texte}
        police={exemplaire.police}
        signature={exemplaire.signature}
        sceau={exemplaire.sceau}
        tronquee
      />
      <div className="mt-3">
        <Button variant="outline" onClick={() => surOuverture(exemplaire)}>
          Modifier
        </Button>
      </div>
    </li>
  );
}

function Modification({
  exemplaire,
  personnages,
  surFermeture,
}: {
  exemplaire: ExemplaireMj;
  personnages: PersonnageResume[];
  /** `change` : quelque chose a été enregistré, la liste est à relire. */
  surFermeture: (change: boolean) => void;
}) {
  const [destinataireId, setDestinataireId] = useState<string | null>(exemplaire.destinataire_id);
  const [sort, setSort] = useState<Acheminement>(exemplaire.acheminement);
  // Une date déjà passée (pli retenu depuis longtemps) est remplacée par une date proche.
  const [date, setDate] = useState(() => {
    const prevue = exemplaire.livraison_le;
    return versChamp(prevue && new Date(prevue) > new Date() ? prevue : dansQuelquesMinutes());
  });
  const [tiers, setTiers] = useState<string | null>(null);
  const [copiesEnvoyees, setCopiesEnvoyees] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function enregistrer() {
    if (!destinataireId) return;
    setOccupe(true);
    setErreur(null);
    try {
      await modifier(`/mj/exemplaires/${exemplaire.id}`, {
        destinataire_id: destinataireId,
        acheminement: sort,
        livraison_le: sort === 'en_route' ? depuisChamp(date) : null,
      } satisfies ExemplaireModifie);
      toast.success('Enregistré');
      surFermeture(true);
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  async function copier() {
    if (!tiers) return;
    setOccupe(true);
    setErreur(null);
    try {
      await appeler(`/mj/exemplaires/${exemplaire.id}/copie`, {
        destinataire_id: tiers,
        livraison_le: null,
      } satisfies CopiePourTiers);
      toast.success(`Copie en route vers ${personnages.find((p) => p.id === tiers)?.nom ?? ''}`);
      setTiers(null);
      setCopiesEnvoyees(true);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Dialog open onOpenChange={(etat) => !etat && surFermeture(copiesEnvoyees)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titreDe(exemplaire)}</DialogTitle>
          <DialogDescription>Envoyé {dateLisible(exemplaire.envoye_le)}</DialogDescription>
        </DialogHeader>

        <Lettre
          texte={exemplaire.texte}
          police={exemplaire.police}
          signature={exemplaire.signature}
          sceau={exemplaire.sceau}
        />

        <Champ libelle="Destinataire" pour="exemplaire-destinataire">
          <ChoixPersonnage
            id="exemplaire-destinataire"
            libelle="Destinataire"
            invite="Choisir un personnage"
            personnages={personnages}
            valeur={destinataireId}
            surChoix={setDestinataireId}
            className="w-full"
          />
        </Champ>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Sort du pli">
          {SORTS.map(({ valeur, libelle }) => (
            <Pastille key={valeur} actif={sort === valeur} surChoix={() => setSort(valeur)}>
              {libelle}
            </Pastille>
          ))}
        </div>

        {sort === 'en_route' && (
          <Champ libelle="Arrivée" pour="exemplaire-date">
            <Input
              id="exemplaire-date"
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Champ>
        )}

        {erreur && (
          <p role="alert" className="text-destructive">
            {erreur}
          </p>
        )}

        <Button disabled={occupe || !destinataireId || (sort === 'en_route' && date === '')} onClick={enregistrer}>
          Enregistrer
        </Button>

        <Separator />

        <Champ
          libelle="Copie pour un tiers"
          pour="exemplaire-copie"
          aide="Le tiers reçoit son propre exemplaire, à la même date."
        >
          <div className="flex flex-wrap gap-2">
            <ChoixPersonnage
              id="exemplaire-copie"
              libelle="Copie pour un tiers"
              invite="Choisir un personnage"
              personnages={personnages.filter((p) => p.id !== exemplaire.destinataire_id)}
              valeur={tiers}
              surChoix={setTiers}
              className="flex-1"
            />
            <Button variant="outline" disabled={occupe || !tiers} onClick={copier}>
              Envoyer une copie
            </Button>
          </div>
        </Champ>
      </DialogContent>
    </Dialog>
  );
}
