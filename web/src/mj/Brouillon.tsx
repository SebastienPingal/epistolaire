import { ArrowLeftIcon, PlusIcon, XIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Confirmation } from '@/composants/Confirmation';
import { Document } from '@/composants/gabarits/Document';
import { contenuVierge, estManuscrit, seSigne } from '@/outils/gabarits';
import { adresseImageMj } from '@/outils/images';
import { lireMemoire } from '@/outils/memoire';
import { libelleEnregistrement, useEnregistrementAuto } from '@/outils/useEnregistrementAuto';
import { useLecture } from '@/outils/useLecture';
import type { BrouillonMj } from '@/types/BrouillonMj';
import type { BrouillonMjSaisi } from '@/types/BrouillonMjSaisi';
import type { Contenu } from '@/types/Contenu';
import type { DocumentSaisi } from '@/types/DocumentSaisi';
import type { EcritureMj } from '@/types/EcritureMj';
import type { Gabarit } from '@/types/Gabarit';
import type { ModeleMj } from '@/types/ModeleMj';
import type { ModeleSaisi } from '@/types/ModeleSaisi';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { Reglages } from '@/types/Reglages';
import type { SceauMj } from '@/types/SceauMj';

import { Attente, Champ, Entete, Section } from './commun';
import {
  CachetMj,
  ChoixEcriturePnj,
  ChoixPersonnage,
  depuisChamp,
  maintenant,
  NOMS_GABARITS,
  nomEtGenre,
  NouveauPnj,
  Pastille,
  versChamp,
} from './courrier';
import { FormulaireContenu, manqueAuContenu } from './formulaires';

export const GABARITS: Gabarit[] = ['billet', 'lettre_longue', 'acte', 'rapport', 'gazette', 'carte'];

const DESCRIPTIONS: Record<Gabarit, string> = {
  billet: 'Écrit à la main. Signature et sceau.',
  lettre_longue: 'Écrite à la main. Lieu et date, signature et sceau.',
  acte: 'Écrit à la main. Autorité, objet, formule finale, signature et sceau.',
  rapport: 'Imprimé. Un titre et des rubriques.',
  gazette: 'Imprimée. Des articles et le courrier des lecteurs.',
  carte: 'Une image, son titre et sa légende.',
};

type Destinataire = { personnage_id: string; date: string };

/** Le document tel que l'écran le montre : les dates sont celles des champs. */
export type EnCours = {
  gabarit: Gabarit;
  /** Chaque gabarit garde ce qu'on y a écrit : en changer ne fait rien perdre. */
  contenus: Partial<Record<Gabarit, Contenu>>;
  auteurId: string | null;
  sansExpediteur: boolean;
  ecritureId: string | null;
  signe: boolean;
  sceauId: string | null;
  destinataires: Destinataire[];
  dateCommune: string;
};

const VIERGE: EnCours = {
  gabarit: 'billet',
  contenus: {},
  auteurId: null,
  sansExpediteur: false,
  ecritureId: null,
  signe: true,
  sceauId: null,
  destinataires: [],
  dateCommune: '',
};

/** Un brouillon vierge, prêt à créer. */
export const BROUILLON_VIERGE: BrouillonMjSaisi = versSaisie(VIERGE);

/** Ce que le serveur range : le contenu du gabarit choisi, et les dates au format du serveur. */
export function versSaisie(enCours: EnCours): BrouillonMjSaisi {
  return {
    auteur_id: enCours.sansExpediteur ? null : enCours.auteurId,
    sans_expediteur: enCours.sansExpediteur,
    contenu: enCours.contenus[enCours.gabarit] ?? contenuVierge(enCours.gabarit),
    signe: enCours.signe,
    sceau_id: enCours.sceauId,
    ecriture_id: enCours.ecritureId,
    destinataires: enCours.destinataires.map((destinataire) => ({
      personnage_id: destinataire.personnage_id,
      livraison_le: depuisChamp(destinataire.date),
    })),
    livraison_commune: depuisChamp(enCours.dateCommune),
  };
}

function depuisBrouillon(brouillon: BrouillonMj): EnCours {
  return {
    gabarit: brouillon.contenu.gabarit,
    contenus: { [brouillon.contenu.gabarit]: brouillon.contenu },
    auteurId: brouillon.auteur_id,
    sansExpediteur: brouillon.sans_expediteur,
    ecritureId: brouillon.ecriture_id,
    signe: brouillon.signe,
    sceauId: brouillon.sceau_id,
    destinataires: brouillon.destinataires.map((destinataire) => ({
      personnage_id: destinataire.personnage_id,
      date: destinataire.livraison_le ? versChamp(destinataire.livraison_le) : '',
    })),
    dateCommune: brouillon.livraison_commune ? versChamp(brouillon.livraison_commune) : '',
  };
}

/**
 * Le document que l'écran Documents gardait dans ce navigateur avant les brouillons, s'il
 * y en a un. Une case ajoutée à un gabarit depuis prend sa valeur vide.
 */
export function ancienDocumentGarde(): BrouillonMjSaisi | null {
  const garde = lireMemoire<Partial<EnCours>>(ANCIENNE_MEMOIRE);
  if (!garde || typeof garde !== 'object') return null;
  const contenus: Partial<Record<Gabarit, Contenu>> = {};
  for (const gabarit of GABARITS) {
    const contenu = garde.contenus?.[gabarit];
    if (contenu && typeof contenu === 'object') {
      contenus[gabarit] = { ...contenuVierge(gabarit), ...contenu, gabarit } as Contenu;
    }
  }
  return versSaisie({
    ...VIERGE,
    ...garde,
    gabarit: GABARITS.includes(garde.gabarit as Gabarit) ? (garde.gabarit as Gabarit) : 'billet',
    contenus,
    destinataires: Array.isArray(garde.destinataires) ? garde.destinataires : [],
  });
}

export const ANCIENNE_MEMOIRE = 'mj:document';

/** Un brouillon du MJ, ouvert dans l'outil unique : tout ce qu'il envoie part d'ici. */
export function Brouillon() {
  const { id } = useParams();
  const brouillon = useLecture<BrouillonMj>(`/mj/brouillons/${id}`);
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const ecritures = useLecture<EcritureMj[]>('/mj/ecritures');
  const sceaux = useLecture<SceauMj[]>('/mj/sceaux');
  const reglages = useLecture<Reglages>('/mj/reglages');
  const modeles = useLecture<ModeleMj[]>('/mj/modeles');

  const retour = (
    <Link
      to="/mj/documents"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Documents
    </Link>
  );

  if (
    !brouillon.donnees ||
    !personnages.donnees ||
    !ecritures.donnees ||
    !sceaux.donnees ||
    !reglages.donnees ||
    !modeles.donnees
  ) {
    return (
      <>
        {retour}
        <Attente
          erreur={
            brouillon.erreur ??
            personnages.erreur ??
            ecritures.erreur ??
            sceaux.erreur ??
            reglages.erreur ??
            modeles.erreur
          }
        />
      </>
    );
  }

  return (
    <>
      {retour}
      <Editeur
        // La clé remet l'écran à neuf quand on change de brouillon.
        key={brouillon.donnees.id}
        brouillon={brouillon.donnees}
        personnages={personnages.donnees}
        ecritures={ecritures.donnees}
        sceaux={sceaux.donnees}
        reglages={reglages.donnees}
        modeles={modeles.donnees}
        surNouveauPnj={async () => {
          await Promise.all([personnages.recharger(), sceaux.recharger()]);
        }}
        surNouveauModele={modeles.recharger}
      />
    </>
  );
}

function Editeur({
  brouillon,
  personnages: tous,
  ecritures,
  sceaux,
  reglages,
  modeles,
  surNouveauPnj,
  surNouveauModele,
}: {
  brouillon: BrouillonMj;
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
  reglages: Reglages;
  modeles: ModeleMj[];
  surNouveauPnj: () => Promise<void>;
  surNouveauModele: () => Promise<void>;
}) {
  const naviguer = useNavigate();

  const [depart] = useState(() => depuisBrouillon(brouillon));
  const [gabarit, setGabarit] = useState<Gabarit>(depart.gabarit);
  const [contenus, setContenus] = useState<Partial<Record<Gabarit, Contenu>>>(depart.contenus);
  const [auteurId, setAuteurId] = useState<string | null>(depart.auteurId);
  const [sansExpediteur, setSansExpediteur] = useState(depart.sansExpediteur);
  const [ecritureId, setEcritureId] = useState<string | null>(depart.ecritureId);
  const [signe, setSigne] = useState(depart.signe);
  const [sceauId, setSceauId] = useState<string | null>(depart.sceauId);
  const [destinataires, setDestinataires] = useState<Destinataire[]>(() => {
    // Un destinataire gardé a pu disparaître depuis : on le retire.
    const ids = new Set(tous.map((personnage) => personnage.id));
    return depart.destinataires.filter((destinataire) => ids.has(destinataire.personnage_id));
  });
  const [dateCommune, setDateCommune] = useState(depart.dateCommune);
  const [creation, setCreation] = useState(false);
  const [jet, setJet] = useState(false);
  const [enregistrementModele, setEnregistrementModele] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Chaque changement est enregistré sur le serveur, un instant après la dernière frappe.
  const saisie = versSaisie({
    gabarit,
    contenus,
    auteurId,
    sansExpediteur,
    ecritureId,
    signe,
    sceauId,
    destinataires,
    dateCommune,
  });
  const enregistrement = useEnregistrementAuto(saisie, versSaisie(depart), (valeur) =>
    modifier(`/mj/brouillons/${brouillon.id}`, valeur),
  );

  const pnj = tous.filter((personnage) => personnage.genre === 'pnj');
  const auteur = sansExpediteur ? null : (pnj.find((personnage) => personnage.id === auteurId) ?? null);
  const contenu = contenus[gabarit] ?? contenuVierge(gabarit);
  const manuscrit = estManuscrit(gabarit);

  // L'écriture : celle du PNJ s'il en a une ; sinon celle qu'on choisit ici.
  const ecritureAChoisir = manuscrit && (sansExpediteur || (auteur !== null && !auteur.ecriture_id));
  const ecriture = ecritures.find(
    (candidate) => candidate.id === (auteur?.ecriture_id ?? ecritureId),
  );
  const police = ecriture?.police ?? null;

  const sesSceaux = auteur ? sceaux.filter((sceau) => sceau.detenteur_id === auteur.id) : [];
  const sceau = sesSceaux.find((candidat) => candidat.id === sceauId) ?? null;
  const signature = auteur !== null && seSigne(gabarit) && signe;

  const choisis = new Set(destinataires.map((destinataire) => destinataire.personnage_id));
  const possibles = tous.filter(
    (personnage) => personnage.id !== auteur?.id && !choisis.has(personnage.id),
  );
  const joueursRestants = possibles.filter((personnage) => personnage.genre === 'joueur');
  const nomDe = (id: string) => tous.find((personnage) => personnage.id === id);

  const manque =
    !sansExpediteur && !auteur
      ? 'Choisissez l’expéditeur, ou « Aucun expéditeur ».'
      : (manqueAuContenu(contenu) ??
        (ecritureAChoisir && !ecritureId
          ? auteur
            ? `Choisissez l'écriture de ${auteur.nom}.`
            : 'Choisissez l’écriture de ce document.'
          : destinataires.length === 0
            ? 'Choisissez au moins un destinataire.'
            : null));

  function changerDAuteur(id: string | null) {
    setAuteurId(id);
    // L'écriture et le sceau choisis étaient ceux de l'expéditeur précédent.
    setEcritureId(null);
    setSceauId(null);
    setDestinataires((avant) => avant.filter((destinataire) => destinataire.personnage_id !== id));
  }

  async function envoyer() {
    setOccupe(true);
    setErreur(null);
    // Le brouillon est jeté par l'envoi lui-même : plus rien ne doit l'enregistrer ensuite.
    await enregistrement.enregistrerMaintenant();
    enregistrement.suspendre(true);
    try {
      await appeler(`/mj/brouillons/${brouillon.id}/envoi`, {
        auteur_id: auteur?.id ?? null,
        contenu,
        signe: signature,
        sceau_id: sceau?.id ?? null,
        ecriture_id: ecritureAChoisir ? ecritureId : null,
        destinataires: destinataires.map((destinataire) => ({
          personnage_id: destinataire.personnage_id,
          livraison_le: depuisChamp(destinataire.date || dateCommune),
        })),
      } satisfies DocumentSaisi);
      toast.success(destinataires.length === 1 ? 'Le pli est en route' : 'Les plis sont en route');
      naviguer('/mj/en-route');
    } catch (e) {
      enregistrement.suspendre(false);
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  async function jeter(confirme: boolean) {
    setJet(false);
    if (!confirme) return;
    enregistrement.suspendre(true);
    try {
      await supprimer(`/mj/brouillons/${brouillon.id}`);
      toast.success('Brouillon jeté');
      naviguer('/mj/documents');
    } catch (e) {
      enregistrement.suspendre(false);
      setErreur(messageErreur(e));
    }
  }

  return (
    <>
      <Entete titre={brouillon.reponse_a_auteur ? `Réponse à ${brouillon.reponse_a_auteur}` : 'Brouillon'}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEnregistrementModele(true)}>
            Enregistrer comme modèle
          </Button>
          <Button variant="ghost" onClick={() => setJet(true)}>
            Jeter
          </Button>
        </div>
      </Entete>
      <p className="mb-2 text-muted-foreground">
        Le document part aussitôt, et chaque destinataire reçoit son exemplaire comme un pli
        ordinaire : fermé, dans sa Réception. Jusqu'à son arrivée, chaque exemplaire reste
        modifiable dans En route.
      </p>
      {brouillon.reponse_a && (
        <p className="mb-2 text-sm text-muted-foreground">
          Cette réponse a été commencée sous une lettre de la file, qui en est sortie depuis :
          elle est devenue un brouillon comme les autres.
        </p>
      )}
      <p role="status" className="mb-6 text-sm text-muted-foreground">
        {libelleEnregistrement(enregistrement.etat, enregistrement.erreur)}
      </p>

      <Section titre="Gabarit">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label="Gabarit">
          {GABARITS.map((choix) => (
            <Pastille
              key={choix}
              actif={gabarit === choix}
              surChoix={() => setGabarit(choix)}
              className="min-h-16 flex-col items-start justify-center gap-0.5 text-left"
            >
              <span className="font-medium">{NOMS_GABARITS[choix]}</span>
              <span className="text-xs text-muted-foreground">{DESCRIPTIONS[choix]}</span>
            </Pastille>
          ))}
        </div>
      </Section>

      <Section titre="Expéditeur">
        <div className="grid gap-3">
          {!sansExpediteur && (
            <div className="flex flex-wrap gap-2">
              {pnj.length > 0 && (
                <ChoixPersonnage
                  id="auteur"
                  libelle="Au nom de"
                  invite="Choisir un PNJ"
                  personnages={pnj}
                  valeur={auteurId}
                  surChoix={changerDAuteur}
                  className="flex-1 sm:max-w-80"
                />
              )}
              <Button variant="outline" onClick={() => setCreation(true)}>
                <PlusIcon />
                Nouveau PNJ
              </Button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Switch
              id="sans-expediteur"
              checked={sansExpediteur}
              onCheckedChange={(coche) => {
                setSansExpediteur(coche);
                setEcritureId(null);
                setSceauId(null);
              }}
            />
            <Label htmlFor="sans-expediteur">
              Aucun expéditeur
              <span className="font-normal text-muted-foreground">
                {' '}
                · une carte trouvée, une affiche. Ni signature, ni sceau.
              </span>
            </Label>
          </div>
        </div>
      </Section>

      {(auteur || sansExpediteur) && (
        <>
          <Section titre={NOMS_GABARITS[gabarit]}>
            <div className="grid gap-5">
              {ecritureAChoisir && (
                <ChoixEcriturePnj
                  nom={auteur?.nom ?? 'Ce document'}
                  aide={
                    auteur
                      ? undefined
                      : 'Ce document est écrit à la main, par une main que personne ne nomme. Choisissez-la.'
                  }
                  personnages={tous}
                  ecritures={ecritures}
                  choisie={ecritureId}
                  surChoix={setEcritureId}
                />
              )}
              <FormulaireContenu
                contenu={contenu}
                surContenu={(change) => setContenus((avant) => ({ ...avant, [gabarit]: change }))}
                longueurBillet={reglages.longueur_billet}
              />
            </div>
          </Section>

          {auteur && (
            <Section titre="Signature et sceau">
              <div className="grid gap-5">
                {seSigne(gabarit) ? (
                  <div className="flex items-center gap-3">
                    <Switch id="document-signer" checked={signe} onCheckedChange={setSigne} />
                    <Label htmlFor="document-signer">Signer du nom de {auteur.nom}</Label>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ce gabarit ne porte pas de signature. Le sceau, lui, ferme le pli : il se voit
                    à l'extérieur.
                  </p>
                )}
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Sceller</legend>
                  {sesSceaux.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {auteur.nom} ne détient aucun sceau : le pli partira sans sceau.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <Pastille actif={sceau === null} surChoix={() => setSceauId(null)}>
                        Sans sceau
                      </Pastille>
                      {sesSceaux.map((candidat) => (
                        <Pastille
                          key={candidat.id}
                          actif={sceau?.id === candidat.id}
                          surChoix={() => setSceauId(candidat.id)}
                        >
                          <CachetMj sceau={candidat} className="size-7" />
                          {candidat.nom_grave}
                        </Pastille>
                      ))}
                    </div>
                  )}
                </fieldset>
              </div>
            </Section>
          )}

          <Section
            titre="Destinataires"
            aide="Chacun reçoit son propre exemplaire. Un PNJ lit le sien aussitôt : c'est vous qui lisez pour lui."
          >
            <div className="grid gap-4">
              {destinataires.length > 0 && (
                <ul className="grid gap-2" aria-label="Destinataires">
                  {destinataires.map((destinataire, rang) => {
                    const personnage = nomDe(destinataire.personnage_id);
                    const changer = (date: string) =>
                      setDestinataires((avant) =>
                        avant.map((autre, position) =>
                          position === rang ? { ...autre, date } : autre,
                        ),
                      );
                    return (
                      <li
                        key={destinataire.personnage_id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10"
                      >
                        <span className="min-w-32 flex-1 font-medium">
                          {personnage ? nomEtGenre(personnage) : ''}
                        </span>
                        {personnage?.genre === 'joueur' && (
                          <>
                            <Input
                              type="datetime-local"
                              aria-label={`Arrivée chez ${personnage.nom}`}
                              className="w-auto"
                              value={destinataire.date}
                              onChange={(e) => changer(e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => changer(versChamp(maintenant()))}
                            >
                              Tout de suite
                            </Button>
                          </>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Retirer ${personnage?.nom ?? 'ce destinataire'}`}
                          onClick={() =>
                            setDestinataires((avant) =>
                              avant.filter((_, position) => position !== rang),
                            )
                          }
                        >
                          <XIcon />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                {possibles.length > 0 && (
                  <ChoixPersonnage
                    // La clé vide le choix une fois le destinataire ajouté.
                    key={destinataires.length}
                    id="destinataire"
                    libelle="Ajouter un destinataire"
                    invite="Ajouter un destinataire…"
                    personnages={possibles}
                    valeur={null}
                    surChoix={(choisi) =>
                      choisi &&
                      setDestinataires((avant) => [...avant, { personnage_id: choisi, date: '' }])
                    }
                  />
                )}
                {joueursRestants.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setDestinataires((avant) => [
                        ...avant,
                        ...joueursRestants.map((joueur) => ({ personnage_id: joueur.id, date: '' })),
                      ])
                    }
                  >
                    Tous les joueurs
                  </Button>
                )}
              </div>

              <Champ
                libelle="Arrivée pour tous"
                pour="date-commune"
                aide="Vide : le délai habituel, plus ou moins le hasard, tiré une fois pour tous. La date d'un destinataire, si vous lui en donnez une, passe avant. Une date passée, ou « Tout de suite », fait arriver dès l'envoi."
              >
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="date-commune"
                    type="datetime-local"
                    className="max-w-64"
                    value={dateCommune}
                    onChange={(e) => setDateCommune(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDateCommune(versChamp(maintenant()))}
                  >
                    Tout de suite
                  </Button>
                </div>
              </Champ>
            </div>
          </Section>

          <Section titre="Aperçu" aide="Le document tel que le lira un destinataire, une fois le pli ouvert.">
            <Document
              // Une gazette prend toute la largeur, pour montrer ses colonnes.
              className={contenu.gabarit === 'gazette' ? undefined : 'max-w-xl'}
              contenu={contenu}
              police={police}
              date={null}
              signature={signature && auteur ? { nom: auteur.nom, police } : null}
              sceau={
                sceau && {
                  nom: sceau.nom_grave,
                  initiales: sceau.initiales,
                  image: sceau.image_id && adresseImageMj(sceau.image_id),
                }
              }
              adresseImage={adresseImageMj}
            />
          </Section>
        </>
      )}

      <p role="status" className="mt-6 min-h-6 text-sm text-muted-foreground">
        {erreur ? <span className="text-destructive">{erreur}</span> : manque}
      </p>
      <div className="mt-2">
        <Button size="lg" disabled={occupe || manque !== null} onClick={envoyer}>
          Envoyer
        </Button>
      </div>

      <Confirmation
        ouverte={jet}
        titre="Jeter ce brouillon ?"
        texte="Le document, ses destinataires et ses dates sont effacés. Rien n'est envoyé."
        action="Jeter"
        surReponse={jeter}
      />

      <EnregistrerModele
        ouvert={enregistrementModele}
        modeles={modeles}
        saisie={{
          nom: '',
          auteur_id: auteur?.id ?? null,
          sans_expediteur: sansExpediteur,
          contenu,
          signe,
          sceau_id: sceau?.id ?? null,
          ecriture_id: ecritureAChoisir ? ecritureId : null,
        }}
        surFermeture={async (enregistre) => {
          setEnregistrementModele(false);
          if (enregistre) await surNouveauModele();
        }}
      />

      <NouveauPnj
        ouvert={creation}
        surFermeture={async (cree) => {
          setCreation(false);
          if (!cree) return;
          await surNouveauPnj();
          changerDAuteur(cree.id);
        }}
      />
    </>
  );
}

/**
 * Enregistre le document en cours comme modèle : tout sauf les destinataires et les dates.
 * Sous le nom d'un modèle existant, il le remplace.
 */
function EnregistrerModele({
  ouvert,
  modeles,
  saisie,
  surFermeture,
}: {
  ouvert: boolean;
  modeles: ModeleMj[];
  /** Le modèle à enregistrer ; son nom est choisi ici. */
  saisie: ModeleSaisi;
  surFermeture: (enregistre: boolean) => void;
}) {
  const [nom, setNom] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const remplace = modeles.find(
    (modele) => modele.nom.trim().toLowerCase() === nom.trim().toLowerCase(),
  );

  async function enregistrer(evenement: FormEvent) {
    evenement.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await appeler('/mj/modeles', { ...saisie, nom } satisfies ModeleSaisi);
      toast.success(remplace ? 'Modèle remplacé' : 'Modèle enregistré');
      setNom('');
      surFermeture(true);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Dialog open={ouvert} onOpenChange={(etat) => !etat && surFermeture(false)}>
      <DialogContent>
        <form onSubmit={enregistrer} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Enregistrer comme modèle</DialogTitle>
            <DialogDescription>
              Le modèle garde le gabarit, le contenu, l'expéditeur, la signature et le sceau ;
              pas les destinataires ni les dates. Ce brouillon reste tel quel.
            </DialogDescription>
          </DialogHeader>
          <Champ
            libelle="Nom du modèle"
            pour="nom-modele"
            aide={
              remplace
                ? `Un modèle porte déjà ce nom : « ${remplace.nom} » sera remplacé.`
                : 'Pour le reconnaître dans la liste : « Avis du Conseil », « Gazette, en-tête »…'
            }
          >
            <Input
              id="nom-modele"
              list="noms-modeles"
              autoComplete="off"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
            />
            <datalist id="noms-modeles">
              {modeles.map((modele) => (
                <option key={modele.id} value={modele.nom} />
              ))}
            </datalist>
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
              {remplace ? 'Remplacer' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
