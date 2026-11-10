import { PlusIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLecture } from '@/outils/useLecture';
import type { GenrePersonnage } from '@/types/GenrePersonnage';
import type { NouveauPersonnage } from '@/types/NouveauPersonnage';
import type { PersonnageDetail } from '@/types/PersonnageDetail';
import type { PersonnageResume } from '@/types/PersonnageResume';

import { Attente, Champ, Entete, Section } from './commun';

export function Personnages() {
  const { donnees, erreur } = useLecture<PersonnageResume[]>('/mj/personnages');
  const [creation, setCreation] = useState(false);

  if (!donnees) return <Attente erreur={erreur} />;

  const joueurs = donnees.filter((p) => p.genre === 'joueur');
  const pnj = donnees.filter((p) => p.genre === 'pnj');

  return (
    <>
      <Entete titre="Personnages">
        <Button onClick={() => setCreation(true)}>
          <PlusIcon />
          Nouveau personnage
        </Button>
      </Entete>

      <Section titre="Joueurs">
        <Liste
          personnages={joueurs}
          vide="Aucun joueur pour l'instant."
          detail={(p) => p.email ?? 'Pas encore invité'}
        />
      </Section>

      <Section titre="PNJ">
        <Liste
          personnages={pnj}
          vide="Aucun PNJ pour l'instant. Vous pourrez aussi en créer au moment d'écrire en leur nom."
          detail={(p) => p.role}
        />
      </Section>

      <Creation ouverte={creation} surFermeture={() => setCreation(false)} />
    </>
  );
}

function Liste({
  personnages,
  vide,
  detail,
}: {
  personnages: PersonnageResume[];
  vide: string;
  detail: (personnage: PersonnageResume) => string;
}) {
  if (personnages.length === 0) {
    return <p className="text-muted-foreground">{vide}</p>;
  }
  return (
    <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
      {personnages.map((personnage) => (
        <li key={personnage.id}>
          <Link
            to={`/mj/personnages/${personnage.id}`}
            className="flex min-h-12 flex-wrap items-baseline justify-between gap-x-4 px-4 py-3 outline-none hover:bg-accent focus-visible:bg-accent"
          >
            <span className="font-medium">{personnage.nom}</span>
            <span className="text-sm text-muted-foreground">{detail(personnage)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Creation({ ouverte, surFermeture }: { ouverte: boolean; surFermeture: () => void }) {
  const naviguer = useNavigate();
  const [nom, setNom] = useState('');
  const [genre, setGenre] = useState<GenrePersonnage>('joueur');
  const [email, setEmail] = useState('');
  const [creerSceau, setCreerSceau] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(evenement: FormEvent) {
    evenement.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      const cree = await appeler<PersonnageDetail>('/mj/personnages', {
        nom,
        genre,
        email: genre === 'joueur' ? email : null,
        creer_sceau: creerSceau,
      } satisfies NouveauPersonnage);
      naviguer(`/mj/personnages/${cree.id}`);
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <Dialog open={ouverte} onOpenChange={(ouvert) => !ouvert && surFermeture()}>
      <DialogContent>
        <form onSubmit={creer} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Nouveau personnage</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Genre du personnage">
            {(['joueur', 'pnj'] as const).map((valeur) => (
              <Button
                key={valeur}
                type="button"
                variant={genre === valeur ? 'default' : 'outline'}
                aria-pressed={genre === valeur}
                onClick={() => setGenre(valeur)}
              >
                {valeur === 'joueur' ? 'Joueur' : 'PNJ'}
              </Button>
            ))}
          </div>

          <Champ libelle="Nom" pour="nouveau-nom">
            <Input
              id="nouveau-nom"
              required
              autoFocus
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </Champ>

          {genre === 'joueur' && (
            <Champ
              libelle="Adresse e-mail du joueur"
              pour="nouveau-email"
              aide="Facultative pour l'instant. Sans elle, le joueur ne peut pas se connecter."
            >
              <Input
                id="nouveau-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Champ>
          )}

          <div className="flex items-center gap-3">
            <Switch id="nouveau-sceau" checked={creerSceau} onCheckedChange={setCreerSceau} />
            <Label htmlFor="nouveau-sceau">Lui créer un sceau à son nom</Label>
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
