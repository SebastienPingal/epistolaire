import { ArrowLeftIcon, Trash2Icon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Cachet } from '@/composants/Cachet';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import { useLecture } from '@/outils/useLecture';
import type { ContactNote } from '@/types/ContactNote';
import type { EcritureMj } from '@/types/EcritureMj';
import type { PersonnageDetail } from '@/types/PersonnageDetail';
import type { PersonnageModifie } from '@/types/PersonnageModifie';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { SceauSaisi } from '@/types/SceauSaisi';

import { Attente, Champ, Confirmation, Section } from './commun';

export function Personnage() {
  const { id } = useParams();
  const chemin = `/mj/personnages/${id}`;
  const { donnees, erreur, recharger } = useLecture<PersonnageDetail>(chemin);
  const ecritures = useLecture<EcritureMj[]>('/mj/ecritures');
  const tous = useLecture<PersonnageResume[]>('/mj/personnages');

  if (!donnees || !ecritures.donnees || !tous.donnees) {
    return <Attente erreur={erreur ?? ecritures.erreur ?? tous.erreur} />;
  }

  return (
    <>
      <Link
        to="/mj/personnages"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Personnages
      </Link>

      {/* La clé remet le formulaire à neuf quand on change de personnage. */}
      <Fiche
        key={donnees.id}
        personnage={donnees}
        ecritures={ecritures.donnees}
        surEnregistrement={async () => {
          await Promise.all([recharger(), ecritures.recharger(), tous.recharger()]);
        }}
      />

      <Sceaux personnage={donnees} surChangement={recharger} />

      {donnees.genre === 'joueur' && (
        <Carnet personnage={donnees} tous={tous.donnees} surChangement={recharger} />
      )}

      <Suppression personnage={donnees} />
    </>
  );
}

// ---------------------------------------------------------------------------
// La fiche
// ---------------------------------------------------------------------------

function Fiche({
  personnage,
  ecritures,
  surEnregistrement,
}: {
  personnage: PersonnageDetail;
  ecritures: EcritureMj[];
  surEnregistrement: () => Promise<void>;
}) {
  const [saisie, setSaisie] = useState({
    nom: personnage.nom,
    email: personnage.email ?? '',
    ecriture_id: personnage.ecriture_id,
    role: personnage.role,
    domaine: personnage.domaine,
    aptitudes: personnage.aptitudes,
    objectifs: personnage.objectifs,
    notes_mj: personnage.notes_mj,
    quota: personnage.quota_hebdo === null ? '' : String(personnage.quota_hebdo),
  });
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const joueur = personnage.genre === 'joueur';

  const changer = <Cle extends keyof typeof saisie>(cle: Cle, valeur: (typeof saisie)[Cle]) =>
    setSaisie((avant) => ({ ...avant, [cle]: valeur }));

  async function enregistrer(evenement: FormEvent) {
    evenement.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await modifier(`/mj/personnages/${personnage.id}`, {
        nom: saisie.nom,
        email: joueur ? saisie.email : null,
        ecriture_id: saisie.ecriture_id,
        role: saisie.role,
        domaine: saisie.domaine,
        aptitudes: saisie.aptitudes,
        objectifs: saisie.objectifs,
        notes_mj: saisie.notes_mj,
        quota_hebdo: saisie.quota.trim() === '' ? null : Number(saisie.quota),
      } satisfies PersonnageModifie);
      await surEnregistrement();
      toast.success('Enregistré');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <form onSubmit={enregistrer}>
      <h1 className="mb-1 font-serif text-2xl text-balance">{personnage.nom}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{joueur ? 'Joueur' : 'PNJ'}</p>

      <div className="grid gap-4">
        <Champ libelle="Nom" pour="nom">
          <Input
            id="nom"
            required
            value={saisie.nom}
            onChange={(e) => changer('nom', e.target.value)}
          />
        </Champ>

        {joueur && (
          <Champ
            libelle="Adresse e-mail du joueur"
            pour="email"
            aide="Il se connecte avec cette adresse. Vide : il ne peut pas se connecter."
          >
            <Input
              id="email"
              type="email"
              inputMode="email"
              value={saisie.email}
              onChange={(e) => changer('email', e.target.value)}
            />
          </Champ>
        )}
      </div>

      <Section
        titre="Écriture"
        aide={
          joueur
            ? 'Deux joueurs ne peuvent pas partager la même écriture.'
            : 'Les PNJ secondaires peuvent partager une écriture générique.'
        }
      >
        <ChoixEcriture
          ecritures={ecritures}
          choisie={saisie.ecriture_id}
          nom={saisie.nom}
          surChoix={(ecritureId) => changer('ecriture_id', ecritureId)}
        />
      </Section>

      <Section titre="Fiche" aide={joueur ? 'Le joueur voit cette fiche.' : undefined}>
        <div className="grid gap-4">
          <Champ libelle="Rôle" pour="role">
            <Input id="role" value={saisie.role} onChange={(e) => changer('role', e.target.value)} />
          </Champ>
          <Champ libelle="Domaine" pour="domaine">
            <Input
              id="domaine"
              value={saisie.domaine}
              onChange={(e) => changer('domaine', e.target.value)}
            />
          </Champ>
          <Champ libelle="Aptitudes" pour="aptitudes">
            <Textarea
              id="aptitudes"
              rows={4}
              value={saisie.aptitudes}
              onChange={(e) => changer('aptitudes', e.target.value)}
            />
          </Champ>
          <Champ libelle="Objectifs" pour="objectifs">
            <Textarea
              id="objectifs"
              rows={4}
              value={saisie.objectifs}
              onChange={(e) => changer('objectifs', e.target.value)}
            />
          </Champ>
        </div>
      </Section>

      <Section titre="Pour vous seul">
        <div className="grid gap-4">
          <Champ libelle="Notes du MJ" pour="notes">
            <Textarea
              id="notes"
              rows={4}
              value={saisie.notes_mj}
              onChange={(e) => changer('notes_mj', e.target.value)}
            />
          </Champ>
          {joueur && (
            <Champ
              libelle="Lettres par semaine"
              pour="quota"
              aide="Vide : le réglage général s'applique."
            >
              <Input
                id="quota"
                type="number"
                min={0}
                inputMode="numeric"
                className="max-w-32"
                value={saisie.quota}
                onChange={(e) => changer('quota', e.target.value)}
              />
            </Champ>
          )}
        </div>
      </Section>

      {erreur && (
        <p role="alert" className="mt-6 text-destructive">
          {erreur}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 mt-6 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button type="submit" size="lg" disabled={occupe}>
          {occupe ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  );
}

function ChoixEcriture({
  ecritures,
  choisie,
  nom,
  surChoix,
}: {
  ecritures: EcritureMj[];
  choisie: string | null;
  nom: string;
  surChoix: (ecritureId: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Écriture">
      {ecritures.map((ecriture) => {
        const active = ecriture.id === choisie;
        const autres = ecriture.utilisee_par.filter((utilisateur) => utilisateur !== nom);
        return (
          <button
            key={ecriture.id}
            type="button"
            aria-pressed={active}
            // Un second appui retire l'écriture.
            onClick={() => surChoix(active ? null : ecriture.id)}
            className={cn(
              'flex min-h-20 flex-col justify-between gap-1 rounded-lg bg-card p-3 text-left ring-1 ring-foreground/10 outline-none transition-shadow hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring',
              active && 'ring-2 ring-primary hover:ring-primary',
            )}
          >
            <Main police={ecriture.police} className="line-clamp-1">
              {nom || 'Un nom'}
            </Main>
            <span className="text-xs text-muted-foreground">
              {ecriture.nom}
              {autres.length > 0 && ` · ${autres.join(', ')}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les sceaux détenus
// ---------------------------------------------------------------------------

function Sceaux({
  personnage,
  surChangement,
}: {
  personnage: PersonnageDetail;
  surChangement: () => Promise<void>;
}) {
  async function creer() {
    try {
      await appeler('/mj/sceaux', {
        nom_grave: personnage.nom,
        initiales: initialesDe(personnage.nom),
        detenteur_id: personnage.id,
      } satisfies SceauSaisi);
      await surChangement();
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <Section
      titre="Sceaux détenus"
      aide="Un sceau porte le nom de son propriétaire d'origine, même s'il change de mains. Les transferts se font depuis l'écran Sceaux."
    >
      {personnage.sceaux.length === 0 ? (
        <p className="text-muted-foreground">Aucun sceau.</p>
      ) : (
        <ul className="flex flex-wrap gap-4">
          {personnage.sceaux.map((sceau) => (
            <li key={sceau.id} className="flex items-center gap-3">
              <Cachet initiales={sceau.initiales} nom={sceau.nom_grave} />
              <span>{sceau.nom_grave}</span>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" className="mt-4" onClick={creer}>
        Créer un sceau à son nom
      </Button>
    </Section>
  );
}

/** Les initiales proposées pour un nom : la première lettre de ses mots en majuscule. */
export function initialesDe(nom: string): string {
  return nom
    .split(/\s+/)
    .map((mot) => mot.charAt(0))
    .filter((lettre) => lettre !== '' && lettre === lettre.toUpperCase() && /\p{L}/u.test(lettre))
    .slice(0, 2)
    .join('');
}

// ---------------------------------------------------------------------------
// Le carnet d'adresses
// ---------------------------------------------------------------------------

function Carnet({
  personnage,
  tous,
  surChangement,
}: {
  personnage: PersonnageDetail;
  tous: PersonnageResume[];
  surChangement: () => Promise<void>;
}) {
  const [ajout, setAjout] = useState<string | null>(null);
  const [qualite, setQualite] = useState('');

  const connus = new Set(personnage.carnet.map((contact) => contact.personnage_id));
  const candidats = tous
    .filter((autre) => autre.id !== personnage.id && !connus.has(autre.id))
    .map((autre) => ({ value: autre.id, label: autre.nom }));

  async function noter(contactId: string, nouvelleQualite: string) {
    try {
      await modifier(`/mj/personnages/${personnage.id}/carnet/${contactId}`, {
        qualite: nouvelleQualite,
      } satisfies ContactNote);
      await surChangement();
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  async function retirer(contactId: string) {
    try {
      await supprimer(`/mj/personnages/${personnage.id}/carnet/${contactId}`);
      await surChangement();
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  async function ajouter(evenement: FormEvent) {
    evenement.preventDefault();
    if (!ajout) return;
    await noter(ajout, qualite);
    setAjout(null);
    setQualite('');
  }

  return (
    <Section
      titre="Carnet d'adresses"
      aide="Les personnages à qui ce joueur peut écrire, et ce qu'il sait d'eux. Chacun ne sait que ce qu'on lui a dit."
    >
      {personnage.carnet.length === 0 ? (
        <p className="text-muted-foreground">Le carnet est vide.</p>
      ) : (
        <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
          {personnage.carnet.map((contact) => (
            <li key={contact.personnage_id} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="min-w-32 flex-1 font-medium">{contact.nom}</span>
              <Input
                aria-label={`Qualité de ${contact.nom}`}
                placeholder="Qualité (facultative)"
                className="max-w-56 flex-1"
                defaultValue={contact.qualite ?? ''}
                // La qualité s'enregistre en quittant le champ.
                onBlur={(e) => {
                  if (e.target.value.trim() !== (contact.qualite ?? '')) {
                    void noter(contact.personnage_id, e.target.value);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Retirer ${contact.nom} du carnet`}
                onClick={() => retirer(contact.personnage_id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {candidats.length > 0 && (
        <form onSubmit={ajouter} className="mt-4 flex flex-wrap items-end gap-2">
          <Select items={candidats} value={ajout} onValueChange={setAjout}>
            <SelectTrigger aria-label="Personnage à ajouter" className="min-w-48">
              <SelectValue placeholder="Ajouter un personnage" />
            </SelectTrigger>
            <SelectContent>
              {candidats.map((candidat) => (
                <SelectItem key={candidat.value} value={candidat.value}>
                  {candidat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label="Qualité du nouveau contact"
            placeholder="Qualité (facultative)"
            className="max-w-56 flex-1"
            value={qualite}
            onChange={(e) => setQualite(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!ajout}>
            Ajouter
          </Button>
        </form>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// La suppression
// ---------------------------------------------------------------------------

function Suppression({ personnage }: { personnage: PersonnageDetail }) {
  const naviguer = useNavigate();
  const [demande, setDemande] = useState(false);

  async function repondre(confirme: boolean) {
    setDemande(false);
    if (!confirme) return;
    try {
      await supprimer(`/mj/personnages/${personnage.id}`);
      naviguer('/mj/personnages');
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <Section titre="Supprimer">
      <Button variant="destructive" onClick={() => setDemande(true)}>
        Supprimer ce personnage
      </Button>
      <Confirmation
        ouverte={demande}
        titre={`Supprimer ${personnage.nom} ?`}
        texte={
          personnage.genre === 'joueur'
            ? 'Sa fiche, son carnet et son accès au site disparaissent. Ce geste est sans retour.'
            : 'Sa fiche disparaît. Ce geste est sans retour.'
        }
        action="Supprimer"
        surReponse={repondre}
      />
    </Section>
  );
}
