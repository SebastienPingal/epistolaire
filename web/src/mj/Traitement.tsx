import { ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { lireMemoire, oublierMemoire } from '@/outils/memoire';
import { libelleEnregistrement, useEnregistrementAuto } from '@/outils/useEnregistrementAuto';
import { useLecture } from '@/outils/useLecture';
import type { BilletPnj } from '@/types/BilletPnj';
import type { Decision } from '@/types/Decision';
import type { EcritureMj } from '@/types/EcritureMj';
import type { FileMj } from '@/types/FileMj';
import type { LettreATraiter } from '@/types/LettreATraiter';
import type { ModeleMj } from '@/types/ModeleMj';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { Reglages } from '@/types/Reglages';
import type { ReponseEnCours } from '@/types/ReponseEnCours';
import type { ReponseGardee } from '@/types/ReponseGardee';
import type { SceauMj } from '@/types/SceauMj';
import type { Traitement as TraitementSaisi } from '@/types/Traitement';
import type { VersionLivree } from '@/types/VersionLivree';

import {
  EditeurVersion,
  estAlteree,
  manqueALaVersion,
  type OriginalVu,
  versionOriginale,
} from './Alteration';
import { nomDuDestinataire } from './ATraiter';
import { Attente, Champ, Section } from './commun';
import {
  BILLET_VIERGE,
  ChoixPersonnage,
  ComposerBillet,
  dansQuelquesMinutes,
  dateLisible,
  depuisChamp,
  maintenant,
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
  const reponse = useLecture<ReponseGardee>(`/mj/a-traiter/${id}/reponse`);
  const modeles = useLecture<ModeleMj[]>('/mj/modeles');

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
    !reglages.donnees ||
    !reponse.donnees ||
    !modeles.donnees
  ) {
    return (
      <>
        {retour}
        <Attente
          erreur={
            file.erreur ??
            personnages.erreur ??
            ecritures.erreur ??
            sceaux.erreur ??
            reglages.erreur ??
            reponse.erreur ??
            modeles.erreur
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
          reponseGardee={reponse.donnees}
          modeles={modeles.donnees}
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
        contenu={lettre.contenu}
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
  reponseGardee,
  modeles,
  surNouveauPnj,
}: {
  lettre: LettreATraiter;
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
  longueur: number;
  /** La réponse commencée sous cette lettre, enregistrée sur le serveur. */
  reponseGardee: ReponseGardee;
  modeles: ModeleMj[];
  surNouveauPnj: () => Promise<void>;
}) {
  const naviguer = useNavigate();
  const vise = lettre.destinataire.genre === 'personnage' ? lettre.destinataire.id : null;

  // Une réponse commencée garde le PNJ à qui la lettre allait être remise.
  const [destinataireId, setDestinataireId] = useState<string | null>(
    (reponseGardee.billet && reponseGardee.pnj_id) || vise,
  );
  const [copies, setCopies] = useState<string[]>([]);
  // La date du champ n'est envoyée que si le MJ y touche : sinon le site applique sa proposition.
  const [date, setDate] = useState(() =>
    versChamp(lettre.date_depassee ? dansQuelquesMinutes() : lettre.date_proposee),
  );
  const [dateChoisie, setDateChoisie] = useState(false);
  // La réponse en cours est un brouillon, enregistré sur le serveur à chaque changement :
  // on la retrouve sur tout appareil. Avant les brouillons, elle était gardée dans le
  // navigateur : une réponse gardée ainsi est reprise, puis oubliée une fois enregistrée.
  const ancienneMemoire = `mj:reponse:${lettre.id}`;
  const [reponse, setReponse] = useState<BilletPnj>(() => ({
    ...BILLET_VIERGE,
    ...(reponseGardee.billet ?? lireMemoire<Partial<BilletPnj>>(ancienneMemoire)),
  }));
  // L'altération : vide tant que le MJ ne touche pas à la lettre.
  const [version, setVersion] = useState<VersionLivree | null>(null);
  const [mainInconnue, setMainInconnue] = useState(false);
  const [creation, setCreation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const destinataire = personnages.find((personnage) => personnage.id === destinataireId) ?? null;
  const versPnj = destinataire?.genre === 'pnj';

  // Une réponse redevenue vierge est oubliée ; sans PNJ choisi, il n'y a rien à enregistrer.
  const pnjId = versPnj ? destinataireId : null;
  const [departReponse] = useState(() => ({
    pnjId,
    reponse: reponseGardee.billet ?? BILLET_VIERGE,
  }));
  const enregistrement = useEnregistrementAuto(
    { pnjId, reponse },
    departReponse,
    async ({ pnjId: pnj, reponse: billet }) => {
      if (JSON.stringify(billet) === JSON.stringify(BILLET_VIERGE)) {
        await supprimer(`/mj/a-traiter/${lettre.id}/reponse`);
      } else if (pnj) {
        await modifier(`/mj/a-traiter/${lettre.id}/reponse`, {
          pnj_id: pnj,
          billet,
        } satisfies ReponseEnCours);
      } else {
        return;
      }
      oublierMemoire(ancienneMemoire);
    },
  );
  const modelesDeBillet = modeles.filter((modele) => modele.contenu.gabarit === 'billet');

  /** Le texte, la signature et le sceau d'un modèle de billet, si ce PNJ détient ce sceau. */
  function partirDuModele(id: string | null) {
    const modele = modelesDeBillet.find((candidat) => candidat.id === id);
    if (!modele || modele.contenu.gabarit !== 'billet' || !destinataire) return;
    const texte = modele.contenu.texte;
    const detenu = sceaux.some(
      (sceau) => sceau.id === modele.sceau_id && sceau.detenteur_id === destinataire.id,
    );
    setReponse((avant) => ({
      ...avant,
      texte,
      signe: modele.signe,
      sceau_id: detenu ? modele.sceau_id : avant.sceau_id,
    }));
  }
  const redirigee = vise !== null && destinataireId !== null && destinataireId !== vise;
  const tiers = personnages.filter(
    (personnage) => personnage.id !== destinataireId && !copies.includes(personnage.id),
  );
  // Un PNJ lit son courrier tout de suite : la date ne compte que pour un joueur.
  const dateUtile =
    !versPnj || copies.some((copie) => personnages.find((p) => p.id === copie)?.genre === 'joueur');
  const manqueReponse = destinataire && versPnj ? manqueAuBillet(destinataire, reponse) : null;
  const original: OriginalVu = {
    contenu: lettre.contenu,
    police: lettre.police,
    signature: lettre.signe ? lettre.auteur_nom : null,
    sceauId: lettre.sceau_id,
    sceau: lettre.sceau,
    auteurId: lettre.auteur_id,
    auteurNom: lettre.auteur_nom,
  };
  // Une altération qui ne change rien n'en est pas une : la lettre part telle quelle.
  const alteree = version !== null && estAlteree(original, version);
  const manqueVersion = alteree ? manqueALaVersion(original, version, mainInconnue) : null;

  async function decider(decision: Decision, succes: string, avecReponse = false) {
    setOccupe(true);
    setErreur(null);
    // La lettre quitte la file : sa réponse ne s'enregistre plus sous elle. Envoyée, elle
    // disparaît ; sinon, le serveur en fait un brouillon ordinaire, tel qu'il l'a reçu.
    await enregistrement.enregistrerMaintenant();
    enregistrement.suspendre(true);
    try {
      await appeler(`/mj/a-traiter/${lettre.id}/traitement`, {
        destinataire_id: destinataireId,
        decision,
        livraison_le: dateChoisie ? depuisChamp(date) : null,
        copies,
        reponse: avecReponse ? reponse : null,
        version: alteree ? version : null,
      } satisfies TraitementSaisi);
      oublierMemoire(ancienneMemoire);
      toast.success(succes);
      naviguer('/mj/a-traiter');
    } catch (e) {
      enregistrement.suspendre(false);
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  async function ecarter() {
    setOccupe(true);
    setErreur(null);
    await enregistrement.enregistrerMaintenant();
    enregistrement.suspendre(true);
    try {
      await appeler(`/mj/a-traiter/${lettre.id}/ecart`, {});
      oublierMemoire(ancienneMemoire);
      toast.success('Lettre écartée');
      naviguer('/mj/a-traiter');
    } catch (e) {
      enregistrement.suspendre(false);
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
            <div className="flex flex-wrap gap-2">
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
              {/* Une date passée vaut « tout de suite » : le pli arrive dès la validation. */}
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDate(versChamp(maintenant()));
                  setDateChoisie(true);
                }}
              >
                Tout de suite
              </Button>
            </div>
          </Champ>
        </Section>
      )}

      {destinataire && versPnj && (
        <Section
          titre={`Réponse de ${destinataire.nom}`}
          aide={`La lettre reste dans la file tant que ${destinataire.nom} n'y a pas répondu, ou que vous ne l'avez pas classée. La réponse part vers ${lettre.auteur_nom}.`}
        >
          {modelesDeBillet.length > 0 && (
            <div className="mb-4">
              <Select
                items={modelesDeBillet.map((modele) => ({ value: modele.id, label: modele.nom }))}
                value={null}
                onValueChange={partirDuModele}
              >
                <SelectTrigger aria-label="Partir d'un modèle" className="min-w-48">
                  <SelectValue placeholder="Partir d'un modèle…" />
                </SelectTrigger>
                <SelectContent>
                  {modelesDeBillet.map((modele) => (
                    <SelectItem key={modele.id} value={modele.id}>
                      {modele.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <ComposerBillet
            pnj={destinataire}
            personnages={personnages}
            ecritures={ecritures}
            sceaux={sceaux}
            longueur={longueur}
            billet={reponse}
            surBillet={setReponse}
          />
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            {libelleEnregistrement(enregistrement.etat, enregistrement.erreur)}
          </p>
        </Section>
      )}

      {destinataire && (
        <Section
          titre="Altération"
          aide="La version altérée part vers tous les destinataires, copies comprises, sans que rien ne soit remarqué. Vous déciderez ensuite pour chacun, dans En route."
        >
          {version === null ? (
            <Button variant="outline" onClick={() => setVersion(versionOriginale(original))}>
              Altérer cette lettre
            </Button>
          ) : (
            <>
              <EditeurVersion
                original={original}
                version={version}
                surVersion={setVersion}
                mainInconnue={mainInconnue}
                surMainInconnue={setMainInconnue}
                personnages={personnages}
                ecritures={ecritures}
                sceaux={sceaux}
              />
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => {
                  setVersion(null);
                  setMainInconnue(false);
                }}
              >
                Renoncer à l'altération
              </Button>
            </>
          )}
        </Section>
      )}

      {(erreur ?? manqueVersion) && (
        <p role="alert" className="mt-6 text-destructive">
          {erreur ?? manqueVersion}
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
              disabled={occupe || manqueReponse !== null || manqueVersion !== null}
              onClick={() => decider('livrer', 'Réponse en route', true)}
            >
              Envoyer la réponse
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={occupe || manqueVersion !== null}
              onClick={() => decider('livrer', 'Lettre classée')}
            >
              Classer sans réponse
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={occupe || manqueVersion !== null}
              onClick={() => decider('perdre', 'Lettre perdue')}
            >
              Perdre
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              disabled={occupe || manqueVersion !== null}
              onClick={() => decider('livrer', `En route vers ${destinataire.nom}`)}
            >
              Livrer
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={occupe || manqueVersion !== null}
              onClick={() => decider('retenir', 'Lettre retenue')}
            >
              Retenir
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={occupe || manqueVersion !== null}
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
