import { FilePlusIcon } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { Confirmation } from '@/composants/Confirmation';
import { oublierMemoire } from '@/outils/memoire';
import { useLecture } from '@/outils/useLecture';
import type { BrouillonCree } from '@/types/BrouillonCree';
import type { BrouillonMj } from '@/types/BrouillonMj';
import type { BrouillonMjSaisi } from '@/types/BrouillonMjSaisi';
import type { ModeleMj } from '@/types/ModeleMj';
import type { NomDeModele } from '@/types/NomDeModele';
import type { PersonnageResume } from '@/types/PersonnageResume';

import { ANCIENNE_MEMOIRE, ancienDocumentGarde, BROUILLON_VIERGE } from './Brouillon';
import { Attente, Champ, Entete, Section } from './commun';
import { dateLisible, NOMS_GABARITS } from './courrier';

/**
 * Tout ce qu'envoie le MJ part d'ici : ses brouillons, enregistrés sur le serveur au fil
 * de l'écriture, et ses modèles, des documents de départ qu'il a nommés.
 */
export function Documents() {
  const naviguer = useNavigate();
  const brouillons = useLecture<BrouillonMj[]>('/mj/brouillons');
  const modeles = useLecture<ModeleMj[]>('/mj/modeles');
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const [occupe, setOccupe] = useState(false);
  const [aRenommer, setARenommer] = useState<ModeleMj | null>(null);
  const [aSupprimer, setASupprimer] = useState<ModeleMj | null>(null);

  // Le document que ce navigateur gardait avant les brouillons devient un brouillon.
  const rechargerBrouillons = brouillons.recharger;
  const repris = useRef(false);
  useEffect(() => {
    if (repris.current) return;
    repris.current = true;
    const ancien = ancienDocumentGarde();
    if (!ancien) return;
    appeler<BrouillonCree>('/mj/brouillons', ancien)
      .then(async () => {
        oublierMemoire(ANCIENNE_MEMOIRE);
        toast.success('Le document en cours dans ce navigateur est devenu un brouillon');
        await rechargerBrouillons();
      })
      .catch(() => undefined);
  }, [rechargerBrouillons]);

  async function commencer(saisie: BrouillonMjSaisi) {
    setOccupe(true);
    try {
      const cree = await appeler<BrouillonCree>('/mj/brouillons', saisie);
      naviguer(`/mj/documents/${cree.id}`);
    } catch (e) {
      toast.error(messageErreur(e));
      setOccupe(false);
    }
  }

  async function supprimerModele(confirme: boolean) {
    const modele = aSupprimer;
    setASupprimer(null);
    if (!confirme || !modele) return;
    try {
      await supprimer(`/mj/modeles/${modele.id}`);
      toast.success('Modèle supprimé');
      await modeles.recharger();
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  if (!brouillons.donnees || !modeles.donnees || !personnages.donnees) {
    return <Attente erreur={brouillons.erreur ?? modeles.erreur ?? personnages.erreur} />;
  }

  const nomDe = (id: string | null) =>
    personnages.donnees?.find((personnage) => personnage.id === id)?.nom ?? null;
  const documents = brouillons.donnees.filter((brouillon) => brouillon.reponse_a === null);
  const reponses = brouillons.donnees.filter((brouillon) => brouillon.reponse_a !== null);

  /** « Billet · au nom du Notaire », « Carte · sans expéditeur ». */
  const description = (document: Pick<ModeleMj, 'contenu' | 'auteur_id' | 'sans_expediteur'>) => {
    const auteur = nomDe(document.auteur_id);
    const expediteur = document.sans_expediteur
      ? 'sans expéditeur'
      : auteur
        ? `au nom de ${auteur}`
        : 'expéditeur à choisir';
    return `${NOMS_GABARITS[document.contenu.gabarit]} · ${expediteur}`;
  };

  return (
    <>
      <Entete titre="Documents">
        <Button disabled={occupe} onClick={() => commencer(BROUILLON_VIERGE)}>
          <FilePlusIcon />
          Nouveau document
        </Button>
      </Entete>
      <p className="mb-6 text-muted-foreground">
        Tout ce que vous envoyez part d'ici. Un document commencé est un brouillon : il est
        enregistré tout seul à chaque changement, et vous le retrouvez sur n'importe quel
        appareil jusqu'à l'envoi. Un modèle est un document de départ : partir d'un modèle crée
        un nouveau brouillon, et le modèle ne change pas.
      </p>

      <Section titre="Brouillons">
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun brouillon en cours.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Brouillons">
            {documents.map((brouillon) => {
              const destinataires = brouillon.destinataires
                .map((destinataire) => nomDe(destinataire.personnage_id))
                .filter((nom) => nom !== null);
              return (
                <li key={brouillon.id}>
                  <Link
                    to={`/mj/documents/${brouillon.id}`}
                    className="block rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10 hover:bg-muted"
                  >
                    <span className="block font-medium">
                      {description(brouillon)}
                      {destinataires.length > 0 && ` → ${destinataires.join(', ')}`}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {brouillon.apercu.trim() || 'Encore vide.'}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      Modifié {dateLisible(brouillon.modifie_le)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {reponses.length > 0 && (
        <Section
          titre="Réponses en cours"
          aide="Les réponses de PNJ commencées sous une lettre de la file. Elles partent avec la lettre, depuis À traiter."
        >
          <ul className="grid gap-2" aria-label="Réponses en cours">
            {reponses.map((brouillon) => (
              <li key={brouillon.id}>
                <Link
                  to={`/mj/a-traiter/${brouillon.reponse_a}`}
                  className="block rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10 hover:bg-muted"
                >
                  <span className="block font-medium">
                    Réponse de {nomDe(brouillon.auteur_id) ?? 'un PNJ'} à{' '}
                    {brouillon.reponse_a_auteur ?? 'une lettre'}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {brouillon.apercu.trim() || 'Encore vide.'}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Modifiée {dateLisible(brouillon.modifie_le)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section
        titre="Modèles"
        aide="Pour en créer un : ouvrez un brouillon, puis « Enregistrer comme modèle »."
      >
        {modeles.donnees.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun modèle pour l'instant.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Modèles">
            {modeles.donnees.map((modele) => (
              <li
                key={modele.id}
                className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10"
              >
                <div className="min-w-48 flex-1">
                  <span className="block font-medium">{modele.nom}</span>
                  <span className="block text-sm text-muted-foreground">
                    {description(modele)}
                  </span>
                  {modele.apercu.trim() && (
                    <span className="block truncate text-sm text-muted-foreground">
                      {modele.apercu}
                    </span>
                  )}
                </div>
                <Button
                  disabled={occupe}
                  onClick={() =>
                    commencer({
                      auteur_id: modele.auteur_id,
                      sans_expediteur: modele.sans_expediteur,
                      contenu: modele.contenu,
                      signe: modele.signe,
                      sceau_id: modele.sceau_id,
                      ecriture_id: modele.ecriture_id,
                      destinataires: [],
                      livraison_commune: null,
                    })
                  }
                >
                  Partir de ce modèle
                </Button>
                <Button variant="outline" onClick={() => setARenommer(modele)}>
                  Renommer
                </Button>
                <Button variant="ghost" onClick={() => setASupprimer(modele)}>
                  Supprimer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <RenommerModele
        // La clé remet le champ au nom du modèle choisi.
        key={aRenommer?.id ?? ''}
        modele={aRenommer}
        surFermeture={async (renomme) => {
          setARenommer(null);
          if (renomme) await modeles.recharger();
        }}
      />

      <Confirmation
        ouverte={aSupprimer !== null}
        titre="Supprimer ce modèle ?"
        texte={`Le modèle « ${aSupprimer?.nom ?? ''} » est supprimé. Les brouillons et les plis partis de lui ne changent pas.`}
        action="Supprimer"
        surReponse={supprimerModele}
      />
    </>
  );
}

function RenommerModele({
  modele,
  surFermeture,
}: {
  modele: ModeleMj | null;
  surFermeture: (renomme: boolean) => void;
}) {
  const [nom, setNom] = useState(modele?.nom ?? '');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function renommer(evenement: FormEvent) {
    evenement.preventDefault();
    if (!modele) return;
    setOccupe(true);
    setErreur(null);
    try {
      await modifier(`/mj/modeles/${modele.id}`, { nom } satisfies NomDeModele);
      surFermeture(true);
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <Dialog open={modele !== null} onOpenChange={(etat) => !etat && surFermeture(false)}>
      <DialogContent>
        <form onSubmit={renommer} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Renommer le modèle</DialogTitle>
          </DialogHeader>
          <Champ libelle="Nom du modèle" pour="renommer-modele">
            <Input
              id="renommer-modele"
              autoComplete="off"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
          </Champ>
          {erreur && (
            <p role="alert" className="text-sm text-destructive">
              {erreur}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => surFermeture(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={occupe || nom.trim() === ''}>
              Renommer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
