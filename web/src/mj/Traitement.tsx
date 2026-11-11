import { ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur, supprimer } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLecture } from '@/outils/useLecture';
import type { BilletPnj } from '@/types/BilletPnj';
import type { Decision } from '@/types/Decision';
import type { EcritureMj } from '@/types/EcritureMj';
import type { FileMj } from '@/types/FileMj';
import type { LettreATraiter } from '@/types/LettreATraiter';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { Reglages } from '@/types/Reglages';
import type { SceauMj } from '@/types/SceauMj';
import type { Traitement as TraitementSaisi } from '@/types/Traitement';

import { nomDuDestinataire } from './ATraiter';
import { Attente, Champ, Section } from './commun';
import {
  BILLET_VIERGE,
  ChoixPersonnage,
  ComposerBillet,
  dansQuelquesMinutes,
  dateLisible,
  depuisChamp,
  Lettre,
  manqueAuBillet,
  MINUTES_DE_RATTRAPAGE,
  NouveauPnj,
  versChamp,
} from './courrier';

/** Une lettre de la file, et la décision du MJ : à qui elle va, quand, avec quelles copies. */
export function Traitement() {
  const { id } = useParams();
  const file = useLecture<FileMj>('/mj/a-traiter');
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const ecritures = useLecture<EcritureMj[]>('/mj/ecritures');
  const sceaux = useLecture<SceauMj[]>('/mj/sceaux');
  const reglages = useLecture<Reglages>('/mj/reglages');

  const retour = (
    <Link
      to="/mj/a-traiter"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />À traiter
    </Link>
  );

  if (
    !file.donnees ||
    !personnages.donnees ||
    !ecritures.donnees ||
    !sceaux.donnees ||
    !reglages.donnees
  ) {
    return (
      <>
        {retour}
        <Attente
          erreur={
            file.erreur ?? personnages.erreur ?? ecritures.erreur ?? sceaux.erreur ?? reglages.erreur
          }
        />
      </>
    );
  }

  const lettre = file.donnees.lettres.find((candidate) => candidate.id === id);
  const ecartee = file.donnees.ecartees.find((candidate) => candidate.id === id);

  return (
    <>
      {retour}
      {lettre ? (
        // La clé remet la décision à neuf quand on change de lettre.
        <Decider
          key={lettre.id}
          lettre={lettre}
          personnages={personnages.donnees}
          ecritures={ecritures.donnees}
          sceaux={sceaux.donnees}
          longueur={reglages.donnees.longueur_billet}
          surNouveauPnj={async () => {
            await Promise.all([personnages.recharger(), sceaux.recharger()]);
          }}
        />
      ) : ecartee ? (
        <Ecartee lettre={ecartee} />
      ) : (
        <p className="text-muted-foreground">
          Cette lettre n'est plus dans la file : elle a déjà été traitée.
        </p>
      )}
    </>
  );
}

function Titre({ lettre }: { lettre: LettreATraiter }) {
  return (
    <>
      <h1 className="font-serif text-2xl text-balance">
        {lettre.auteur_nom} à {nomDuDestinataire(lettre)}
      </h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Envoyée {dateLisible(lettre.envoye_le)}
      </p>
      <Lettre
        texte={lettre.texte}
        police={lettre.police}
        signature={lettre.signe ? lettre.auteur_nom : null}
        sceau={lettre.sceau}
      />
    </>
  );
}

function Ecartee({ lettre }: { lettre: LettreATraiter }) {
  const naviguer = useNavigate();

  async function reprendre() {
    try {
      await supprimer(`/mj/a-traiter/${lettre.id}/ecart`);
      toast.success('Lettre remise dans la file');
      naviguer('/mj/a-traiter');
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  return (
    <>
      <Titre lettre={lettre} />
      <p className="mt-6 text-muted-foreground">Vous avez écarté cette lettre.</p>
      <Button variant="outline" className="mt-3" onClick={reprendre}>
        Remettre dans la file
      </Button>
    </>
  );
}

function Decider({
  lettre,
  personnages,
  ecritures,
  sceaux,
  longueur,
  surNouveauPnj,
}: {
  lettre: LettreATraiter;
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
  longueur: number;
  surNouveauPnj: () => Promise<void>;
}) {
  const naviguer = useNavigate();
  const vise = lettre.destinataire.genre === 'personnage' ? lettre.destinataire.id : null;

  const [destinataireId, setDestinataireId] = useState<string | null>(vise);
  const [copies, setCopies] = useState<string[]>([]);
  // La date du champ n'est envoyée que si le MJ y touche : sinon le site applique sa proposition.
  const [date, setDate] = useState(() =>
    versChamp(lettre.date_depassee ? dansQuelquesMinutes() : lettre.date_proposee),
  );
  const [dateChoisie, setDateChoisie] = useState(false);
  const [reponse, setReponse] = useState<BilletPnj>(BILLET_VIERGE);
  const [creation, setCreation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const destinataire = personnages.find((personnage) => personnage.id === destinataireId) ?? null;
  const versPnj = destinataire?.genre === 'pnj';
  const redirigee = vise !== null && destinataireId !== null && destinataireId !== vise;
  const tiers = personnages.filter(
    (personnage) => personnage.id !== destinataireId && !copies.includes(personnage.id),
  );
  // Un PNJ lit son courrier tout de suite : la date ne compte que pour un joueur.
  const dateUtile =
    !versPnj || copies.some((copie) => personnages.find((p) => p.id === copie)?.genre === 'joueur');
  const manqueReponse = destinataire && versPnj ? manqueAuBillet(destinataire, reponse) : null;

  async function decider(decision: Decision, succes: string, avecReponse = false) {
    setOccupe(true);
    setErreur(null);
    try {
      await appeler(`/mj/a-traiter/${lettre.id}/traitement`, {
        destinataire_id: destinataireId,
        decision,
        livraison_le: dateChoisie ? depuisChamp(date) : null,
        copies,
        reponse: avecReponse ? reponse : null,
      } satisfies TraitementSaisi);
      toast.success(succes);
      naviguer('/mj/a-traiter');
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  async function ecarter() {
    setOccupe(true);
    setErreur(null);
    try {
      await appeler(`/mj/a-traiter/${lettre.id}/ecart`, {});
      toast.success('Lettre écartée');
      naviguer('/mj/a-traiter');
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <>
      <Titre lettre={lettre} />

      <Section titre="Destinataire">
        <div className="flex flex-wrap items-center gap-2">
          <ChoixPersonnage
            libelle="Destinataire"
            invite="Choisir un personnage"
            personnages={personnages}
            valeur={destinataireId}
            surChoix={(choisi) => {
              setDestinataireId(choisi);
              setCopies((avant) => avant.filter((copie) => copie !== choisi));
            }}
          />
          <Button variant="outline" onClick={() => setCreation(true)}>
            <PlusIcon />
            Nouveau PNJ
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {lettre.destinataire.genre === 'libre' &&
            `L'auteur a écrit une adresse libre : ${nomDuDestinataire(lettre)}. À vous de dire qui la reçoit.`}
          {lettre.destinataire.genre === 'gazette' &&
            'Cette lettre est pour la gazette. Vous pouvez la remettre à quelqu’un, comme une lettre interceptée, ou l’écarter.'}
          {redirigee &&
            `Redirigée : ${nomDuDestinataire(lettre)} ne la recevra pas, sauf si vous lui en adressez une copie.`}
        </p>
      </Section>

      {destinataire && (
        <Section
          titre="Copies pour des tiers"
          aide="Chaque tiers reçoit son propre exemplaire, en même temps que le destinataire."
        >
          {copies.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {copies.map((copie) => (
                <li key={copie}>
                  <Badge variant="secondary" className="h-7 gap-1 pr-1 text-sm">
                    {personnages.find((personnage) => personnage.id === copie)?.nom}
                    <button
                      type="button"
                      aria-label="Retirer cette copie"
                      className="rounded-full p-0.5 hover:bg-foreground/10"
                      onClick={() => setCopies((avant) => avant.filter((autre) => autre !== copie))}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          {tiers.length > 0 && (
            <ChoixPersonnage
              // La clé vide le choix une fois la copie ajoutée.
              key={copies.length}
              libelle="Ajouter une copie"
              invite="Ajouter une copie pour…"
              personnages={tiers}
              valeur={null}
              surChoix={(choisi) => choisi && setCopies((avant) => [...avant, choisi])}
            />
          )}
        </Section>
      )}

      {destinataire && dateUtile && (
        <Section titre="Date de livraison">
          <Champ
            libelle="Arrivée"
            pour="livraison"
            aide={
              lettre.date_depassee
                ? `La date proposée (${dateLisible(lettre.date_proposee)}) est passée. Sans autre choix, le pli arrivera ${MINUTES_DE_RATTRAPAGE} minutes après votre validation.`
                : 'C’est la date proposée par le site. Changez-la librement.'
            }
          >
            <Input
              id="livraison"
              type="datetime-local"
              className="max-w-64"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setDateChoisie(e.target.value !== '');
              }}
            />
          </Champ>
        </Section>
      )}

      {destinataire && versPnj && (
        <Section
          titre={`Réponse de ${destinataire.nom}`}
          aide={`La lettre reste dans la file tant que ${destinataire.nom} n'y a pas répondu, ou que vous ne l'avez pas classée. La réponse part vers ${lettre.auteur_nom}.`}
        >
          <ComposerBillet
            pnj={destinataire}
            personnages={personnages}
            ecritures={ecritures}
            sceaux={sceaux}
            longueur={longueur}
            billet={reponse}
            surBillet={setReponse}
          />
        </Section>
      )}

      {erreur && (
        <p role="alert" className="mt-6 text-destructive">
          {erreur}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 mt-8 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
        {!destinataire ? (
          <>
            <Button variant="outline" disabled={occupe} onClick={ecarter}>
              Écarter
            </Button>
            <span className="text-sm text-muted-foreground">
              Choisissez un destinataire pour la mettre en route.
            </span>
          </>
        ) : versPnj ? (
          <>
            <Button
              size="lg"
              disabled={occupe || manqueReponse !== null}
              onClick={() => decider('livrer', 'Réponse en route', true)}
            >
              Envoyer la réponse
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={occupe}
              onClick={() => decider('livrer', 'Lettre classée')}
            >
              Classer sans réponse
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={occupe}
              onClick={() => decider('perdre', 'Lettre perdue')}
            >
              Perdre
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              disabled={occupe}
              onClick={() => decider('livrer', `En route vers ${destinataire.nom}`)}
            >
              Livrer
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={occupe}
              onClick={() => decider('retenir', 'Lettre retenue')}
            >
              Retenir
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={occupe}
              onClick={() => decider('perdre', 'Lettre perdue')}
            >
              Perdre
            </Button>
          </>
        )}
      </div>

      <NouveauPnj
        ouvert={creation}
        nomPropose={lettre.destinataire.genre === 'libre' ? lettre.destinataire.adresse : ''}
        surFermeture={async (cree) => {
          setCreation(false);
          if (!cree) return;
          await surNouveauPnj();
          setDestinataireId(cree.id);
          setCopies((avant) => avant.filter((copie) => copie !== cree.id));
        }}
      />
    </>
  );
}
