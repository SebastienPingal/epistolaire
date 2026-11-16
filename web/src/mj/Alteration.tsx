import { ArrowLeftIcon, XIcon } from 'lucide-react';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { messageErreur, modifier } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Document } from '@/composants/gabarits/Document';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import {
  casesDe,
  ecrireCase,
  estManuscrit,
  memeContenu,
  passagesDe,
  reecrituresDuContenu,
  seSigne,
  voilerContenu,
} from '@/outils/gabarits';
import { adresseImageMj } from '@/outils/images';
import { decalerPassages, enCaracteres, extrait, morceaux, reunir } from '@/outils/passages';
import { useLecture } from '@/outils/useLecture';
import { policeDe } from '@/theme/ecritures';
import type { Contenu } from '@/types/Contenu';
import type { EcritureMj } from '@/types/EcritureMj';
import type { EtatSceau } from '@/types/EtatSceau';
import type { EtatSignature } from '@/types/EtatSignature';
import type { Evenement } from '@/types/Evenement';
import type { ExemplaireDetail } from '@/types/ExemplaireDetail';
import type { Passage } from '@/types/Passage';
import type { PersonnageResume } from '@/types/PersonnageResume';
import type { SceauMj } from '@/types/SceauMj';
import type { SceauPose } from '@/types/SceauPose';
import type { VersionLivree } from '@/types/VersionLivree';

import { Attente, Champ, Section } from './commun';
import { ChoixPersonnage, dateLisible, Lettre, nomEtGenre, Pastille, resume } from './courrier';
import { ChoixImage, libelleDeLaCase, manqueAuContenu } from './formulaires';

// ---------------------------------------------------------------------------
// L'original, et la version livrée qui en découle
// ---------------------------------------------------------------------------

/** Ce que l'auteur a écrit, tel que l'atelier en a besoin. */
export type OriginalVu = {
  /** Le gabarit et ses cases, tels que l'auteur les a écrits. */
  contenu: Contenu;
  /** La police de l'écriture de l'auteur. */
  police: string | null;
  /** Le nom de l'auteur, si la lettre est signée. */
  signature: string | null;
  sceauId: string | null;
  sceau: SceauPose | null;
  auteurId: string | null;
  auteurNom: string | null;
};

/** La version livrée d'une lettre que personne n'a touchée. */
export function versionOriginale(original: OriginalVu): VersionLivree {
  return {
    contenu: original.contenu,
    passages_abimes: [],
    sceau_id: original.sceauId,
    sceau_etat: original.sceauId ? 'intact' : null,
    signature_etat: original.signature ? 'intacte' : 'absente',
    signature_nom: original.signature,
    signature_personnage_id: original.signature ? original.auteurId : null,
    faussaire_personnage_id: null,
    faussaire_ecriture_id: null,
    remarque_texte: false,
    remarque_sceau: false,
    remarque_signature: false,
  };
}

/** La version livrée diffère-t-elle de ce que l'auteur a écrit ? */
export function estAlteree(original: OriginalVu, version: VersionLivree): boolean {
  const intacte = versionOriginale(original);
  return (
    !memeContenu(version.contenu, intacte.contenu) ||
    version.passages_abimes.length > 0 ||
    version.sceau_id !== intacte.sceau_id ||
    version.sceau_etat !== intacte.sceau_etat ||
    version.signature_etat !== intacte.signature_etat
  );
}

const sceauTrafique = (version: VersionLivree) =>
  version.sceau_etat !== null && version.sceau_etat !== 'intact';

/** Ce qui manque à une version pour être enregistrée, ou `null` si elle est prête. */
export function manqueALaVersion(
  original: OriginalVu,
  version: VersionLivree,
  mainInconnue: boolean,
): string | null {
  const manqueAuTexte = manqueAuContenu(version.contenu);
  if (manqueAuTexte !== null) {
    return estManuscrit(version.contenu.gabarit)
      ? 'Le texte livré est vide. Pour qu’une lettre n’arrive pas, perdez-la plutôt.'
      : manqueAuTexte;
  }
  if (version.sceau_etat === 'contrefait' && !version.sceau_id) {
    return 'Choisissez le sceau imité.';
  }
  if (
    version.signature_etat === 'contrefaite' &&
    !version.signature_personnage_id &&
    (version.signature_nom ?? '').trim() === ''
  ) {
    return 'Une signature contrefaite porte un nom.';
  }
  if (mainInconnue && !version.faussaire_ecriture_id) {
    return 'Choisissez l’écriture de la main inconnue.';
  }
  const sansFaussaire = !version.faussaire_personnage_id && !version.faussaire_ecriture_id;
  const reecrit = reecrituresDuContenu(original.contenu, version.contenu).length > 0;
  if (
    sansFaussaire &&
    ((version.remarque_texte && reecrit) ||
      (version.remarque_signature && version.signature_etat === 'contrefaite'))
  ) {
    return 'Désignez le faussaire : ce que le destinataire remarque paraîtra dans son écriture.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// L'écran : un exemplaire en route, son original, sa version livrée, son historique
// ---------------------------------------------------------------------------

/** L'atelier du faussaire : altérer l'exemplaire d'un destinataire, tant qu'il est en chemin. */
export function Alteration() {
  const { id } = useParams();
  const exemplaire = useLecture<ExemplaireDetail>(`/mj/exemplaires/${id}`);
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const ecritures = useLecture<EcritureMj[]>('/mj/ecritures');
  const sceaux = useLecture<SceauMj[]>('/mj/sceaux');

  const retour = (
    <Link
      to="/mj/en-route"
      className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      En route
    </Link>
  );

  if (!exemplaire.donnees || !personnages.donnees || !ecritures.donnees || !sceaux.donnees) {
    return (
      <>
        {retour}
        <Attente
          erreur={exemplaire.erreur ?? personnages.erreur ?? ecritures.erreur ?? sceaux.erreur}
        />
      </>
    );
  }

  return (
    <>
      {retour}
      {/* La clé remet l'atelier à neuf quand on change d'exemplaire. */}
      <Atelier
        key={exemplaire.donnees.id}
        initial={exemplaire.donnees}
        personnages={personnages.donnees}
        ecritures={ecritures.donnees}
        sceaux={sceaux.donnees}
      />
    </>
  );
}

function Atelier({
  initial,
  personnages,
  ecritures,
  sceaux,
}: {
  initial: ExemplaireDetail;
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
}) {
  // Ce que le serveur a enregistré en dernier, et ce que le MJ est en train de régler.
  const [exemplaire, setExemplaire] = useState(initial);
  const [version, setVersion] = useState(initial.version);
  const [mainInconnue, setMainInconnue] = useState(
    !initial.version.faussaire_personnage_id && initial.version.faussaire_ecriture_id !== null,
  );
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const original: OriginalVu = {
    contenu: exemplaire.original.contenu,
    police: exemplaire.original.police,
    signature: exemplaire.original.signe ? exemplaire.auteur_nom : null,
    sceauId: exemplaire.original.sceau_id,
    sceau: exemplaire.original.sceau,
    auteurId: exemplaire.auteur_id,
    auteurNom: exemplaire.auteur_nom,
  };
  const manque = manqueALaVersion(original, version, mainInconnue);
  const change = JSON.stringify(version) !== JSON.stringify(exemplaire.version);

  async function enregistrer() {
    setOccupe(true);
    setErreur(null);
    try {
      const recu = await modifier<ExemplaireDetail>(
        `/mj/exemplaires/${exemplaire.id}/version`,
        version,
      );
      setExemplaire(recu);
      setVersion(recu.version);
      toast.success('Version livrée enregistrée');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h1 className="font-serif text-2xl text-balance">
          {exemplaire.auteur_nom ?? 'Sans auteur'} à {exemplaire.destinataire_nom}
        </h1>
        {exemplaire.origine === 'redirection' && <Badge variant="secondary">Redirigé</Badge>}
        {exemplaire.origine === 'copie' && <Badge variant="secondary">Copie</Badge>}
      </div>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Envoyée {dateLisible(exemplaire.envoye_le)}
        {exemplaire.acheminement === 'en_route' &&
          exemplaire.livraison_le &&
          (exemplaire.arrive
            ? ` · arrivée ${dateLisible(exemplaire.livraison_le)}`
            : ` · arrive ${dateLisible(exemplaire.livraison_le)}`)}
        {exemplaire.acheminement === 'retenu' && ' · retenue'}
        {exemplaire.acheminement === 'perdu' && ' · perdue'}
      </p>

      {exemplaire.arrive ? (
        <>
          <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm">
            Ce pli est arrivé : il ne se modifie plus.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Volet titre="Original">
              <Lettre
                contenu={original.contenu}
                police={original.police}
                signature={original.signature}
                sceau={original.sceau}
              />
            </Volet>
            <Volet titre={`Ce qu'a reçu ${exemplaire.destinataire_nom}`}>
              <Apercu
                original={original}
                version={version}
                reecrits={exemplaire.passages_reecrits}
                personnages={personnages}
                ecritures={ecritures}
                sceaux={sceaux}
              />
            </Volet>
          </div>
        </>
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
            destinataireNom={exemplaire.destinataire_nom}
            enregistre={{
              contenu: exemplaire.version.contenu,
              passages: exemplaire.passages_reecrits,
            }}
          />

          {(erreur ?? manque) && (
            <p role="alert" className="mt-6 text-destructive">
              {erreur ?? manque}
            </p>
          )}

          <div className="sticky bottom-0 -mx-4 mt-8 flex flex-wrap items-center gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur">
            <Button size="lg" disabled={occupe || !change || manque !== null} onClick={enregistrer}>
              Enregistrer
            </Button>
            <Button
              size="lg"
              variant="ghost"
              disabled={occupe || !estAlteree(original, version)}
              onClick={() => {
                setVersion(versionOriginale(original));
                setMainInconnue(false);
              }}
            >
              Rétablir l'original
            </Button>
            {!change && <span className="text-sm text-muted-foreground">Tout est enregistré.</span>}
          </div>
        </>
      )}

      <Historique evenements={exemplaire.historique} />
    </>
  );
}

function Volet({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-2 text-sm font-medium">{titre}</h3>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'éditeur : il sert ici, et au traitement d'une lettre
// ---------------------------------------------------------------------------

const ETATS_SCEAU: { valeur: EtatSceau; libelle: string }[] = [
  { valeur: 'intact', libelle: 'Intact' },
  { valeur: 'brise', libelle: 'Brisé' },
  { valeur: 'recolle', libelle: 'Recollé' },
  { valeur: 'contrefait', libelle: 'Contrefait' },
];

const ETATS_SIGNATURE: Record<EtatSignature, string> = {
  absente: 'Aucune',
  intacte: 'Intacte',
  retiree: 'Retirée',
  contrefaite: 'Contrefaite',
};

const PAS_DESIGNE = 'aucun';
const MAIN_INCONNUE = 'inconnue';

/**
 * Tout ce qui se règle dans la version livrée : chaque case du document et ses passages
 * abîmés, l'image d'une carte, le sceau, la signature, le faussaire, et ce que le
 * destinataire remarque.
 */
export function EditeurVersion({
  original,
  version,
  surVersion,
  mainInconnue,
  surMainInconnue,
  personnages,
  ecritures,
  sceaux,
  destinataireNom,
  enregistre,
}: {
  original: OriginalVu;
  version: VersionLivree;
  surVersion: (version: VersionLivree) => void;
  /** Le faussaire est une main inconnue, dont l'écriture reste peut-être à choisir. */
  mainInconnue: boolean;
  surMainInconnue: (mainInconnue: boolean) => void;
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
  /**
   * Le destinataire de cet exemplaire : on décide alors de ce qu'il remarque.
   * Vide : la version part vers plusieurs destinataires, et rien n'est remarqué.
   */
  destinataireNom?: string;
  /** Le dernier contenu enregistré, et les passages réécrits que le serveur y a repérés. */
  enregistre?: { contenu: Contenu; passages: Passage[] };
}) {
  const changer = (changement: Partial<VersionLivree>) => surVersion({ ...version, ...changement });

  // Tant que le contenu est celui qui est enregistré, on montre le repérage du serveur :
  // c'est lui qui compte. Pendant la frappe, c'est un aperçu calculé ici.
  const reecrits = useMemo(
    () =>
      enregistre && memeContenu(enregistre.contenu, version.contenu)
        ? enregistre.passages
        : reecrituresDuContenu(original.contenu, version.contenu),
    [enregistre, original.contenu, version.contenu],
  );
  const gabarit = version.contenu.gabarit;
  const cases = casesDe(version.contenu);
  const casesDOrigine = new Map(casesDe(original.contenu).map(({ chemin, texte }) => [chemin, texte]));

  /** Change le texte d'une case : ses passages abîmés suivent, ceux des autres ne bougent pas. */
  function ecrire(chemin: string, avant: string, apres: string) {
    changer({
      contenu: ecrireCase(version.contenu, chemin, apres),
      passages_abimes: [
        ...version.passages_abimes.filter((passage) => passage.champ !== chemin),
        ...decalerPassages(avant, apres, passagesDe(version.passages_abimes, chemin)),
      ],
    });
  }

  /** Remplace les passages abîmés d'une case. */
  function abimer(chemin: string, passages: Passage[]) {
    changer({
      passages_abimes: [
        ...version.passages_abimes.filter((passage) => passage.champ !== chemin),
        ...reunir(passages),
      ],
    });
  }

  const sceauxPossibles = original.sceauId
    ? ETATS_SCEAU
    : ETATS_SCEAU.filter(({ valeur }) => valeur === 'contrefait');
  // Seuls les gabarits écrits à la main portent une signature.
  const signaturesPossibles: EtatSignature[] = !seSigne(gabarit)
    ? []
    : original.signature
      ? ['intacte', 'retiree', 'contrefaite']
      : ['absente', 'contrefaite'];
  const ecrituresLibres = ecritures.filter((ecriture) => ecriture.utilisee_par.length === 0);
  const faussaires = personnages.filter((personnage) => personnage.ecriture_id !== null);
  const choixFaussaire = [
    { value: PAS_DESIGNE, label: 'Pas encore désigné' },
    { value: MAIN_INCONNUE, label: 'Une main inconnue' },
    ...faussaires.map((personnage) => ({ value: personnage.id, label: nomEtGenre(personnage) })),
  ];
  const faussaireChoisi =
    version.faussaire_personnage_id ?? (mainInconnue ? MAIN_INCONNUE : PAS_DESIGNE);
  const choixSceaux = sceaux.map((sceau) => ({
    value: sceau.id,
    label: `${sceau.nom_grave} (${sceau.initiales})`,
  }));

  function choisirSceau(etat: EtatSceau | null) {
    if (etat === null) return changer({ sceau_id: null, sceau_etat: null });
    if (etat !== 'contrefait') return changer({ sceau_id: original.sceauId, sceau_etat: etat });
    // Une imitation : par défaut, celle du sceau de l'auteur.
    changer({
      sceau_etat: 'contrefait',
      sceau_id:
        version.sceau_etat === 'contrefait'
          ? version.sceau_id
          : (original.sceauId ?? sceaux[0]?.id ?? null),
    });
  }

  function choisirSignature(etat: EtatSignature) {
    if (etat === 'absente') {
      return changer({ signature_etat: etat, signature_nom: null, signature_personnage_id: null });
    }
    if (etat !== 'contrefaite') {
      return changer({
        signature_etat: etat,
        signature_nom: original.signature,
        signature_personnage_id: original.auteurId,
      });
    }
    // Une contrefaçon : par défaut, celle de la signature de l'auteur.
    changer({
      signature_etat: 'contrefaite',
      signature_nom: version.signature_nom ?? original.auteurNom,
      signature_personnage_id: version.signature_personnage_id ?? original.auteurId,
    });
  }

  function choisirFaussaire(choix: string | null) {
    surMainInconnue(choix === MAIN_INCONNUE);
    if (choix === null || choix === PAS_DESIGNE || choix === MAIN_INCONNUE) {
      return changer({ faussaire_personnage_id: null, faussaire_ecriture_id: null });
    }
    const personnage = personnages.find((candidat) => candidat.id === choix);
    changer({
      faussaire_personnage_id: choix,
      faussaire_ecriture_id: personnage?.ecriture_id ?? null,
    });
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 md:grid-cols-2">
        <Volet titre="Original">
          <Lettre
            contenu={original.contenu}
            police={original.police}
            signature={original.signature}
            sceau={original.sceau}
          />
        </Volet>

        <Volet titre="Version livrée">
          <div className="grid gap-4">
            {version.contenu.gabarit === 'carte' && (
              <ImageLivree
                image={version.contenu.image}
                origine={original.contenu.gabarit === 'carte' ? original.contenu.image : null}
                surImage={(image) =>
                  version.contenu.gabarit === 'carte' &&
                  changer({ contenu: { ...version.contenu, image } })
                }
              />
            )}
            {cases.map(({ chemin, texte, long }) => (
              <CaseLivree
                key={chemin}
                // Un billet n'a qu'une case : inutile de la nommer.
                libelle={cases.length === 1 ? null : libelleDeLaCase(chemin)}
                texte={texte}
                origine={casesDOrigine.get(chemin) ?? ''}
                long={long}
                police={estManuscrit(gabarit) ? original.police : null}
                reecrits={passagesDe(reecrits, chemin)}
                abimes={passagesDe(version.passages_abimes, chemin)}
                surTexte={(apres) => ecrire(chemin, texte, apres)}
                surAbimes={(passages) => abimer(chemin, passages)}
                champ={chemin}
              />
            ))}
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm bg-bon/25" />
              réécrit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm bg-foreground/25" />
              abîmé
            </span>
            <span>Les suppressions ne se voient pas.</span>
          </p>
        </Volet>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Sceau</legend>
        <div className="flex flex-wrap gap-2">
          {!original.sceauId && (
            <Pastille actif={version.sceau_etat === null} surChoix={() => choisirSceau(null)}>
              Sans sceau
            </Pastille>
          )}
          {sceauxPossibles.map(({ valeur, libelle }) => (
            <Pastille
              key={valeur}
              actif={version.sceau_etat === valeur}
              surChoix={() => choisirSceau(valeur)}
            >
              {libelle}
            </Pastille>
          ))}
        </div>
        {version.sceau_etat === 'contrefait' && (
          <div className="mt-3">
            <Champ
              libelle="Sceau imité"
              pour="sceau-imite"
              aide="Le destinataire voit ce sceau. S'il remarque quelque chose, le cachet paraît légèrement différent."
            >
              {sceaux.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun sceau n'existe encore.</p>
              ) : (
                <Select
                  items={choixSceaux}
                  value={version.sceau_id}
                  onValueChange={(sceau_id) => changer({ sceau_id })}
                >
                  <SelectTrigger id="sceau-imite" aria-label="Sceau imité" className="w-full sm:w-72">
                    <SelectValue placeholder="Choisir un sceau" />
                  </SelectTrigger>
                  <SelectContent>
                    {choixSceaux.map((sceau) => (
                      <SelectItem key={sceau.value} value={sceau.value}>
                        {sceau.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Champ>
          </div>
        )}
      </fieldset>

      {signaturesPossibles.length > 0 && (
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Signature</legend>
        <div className="flex flex-wrap gap-2">
          {signaturesPossibles.map((etat) => (
            <Pastille
              key={etat}
              actif={version.signature_etat === etat}
              surChoix={() => choisirSignature(etat)}
            >
              {ETATS_SIGNATURE[etat]}
            </Pastille>
          ))}
        </div>
        {version.signature_etat === 'contrefaite' && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Champ
              libelle="Signature imitée"
              pour="signature-imitee"
              aide="Sans rien de remarqué, la signature paraît de sa main. Il entrera dans le carnet du destinataire."
            >
              <ChoixPersonnage
                id="signature-imitee"
                libelle="Signature imitée"
                invite="Choisir un personnage"
                personnages={personnages}
                valeur={version.signature_personnage_id}
                surChoix={(personnageId) =>
                  changer({
                    signature_personnage_id: personnageId,
                    signature_nom:
                      personnages.find((candidat) => candidat.id === personnageId)?.nom ??
                      version.signature_nom,
                  })
                }
                className="w-full"
              />
            </Champ>
            <Champ libelle="Nom tracé" pour="signature-nom">
              <Input
                id="signature-nom"
                value={version.signature_nom ?? ''}
                onChange={(e) => changer({ signature_nom: e.target.value })}
              />
            </Champ>
          </div>
        )}
      </fieldset>
      )}

      <fieldset>
        <legend className="text-sm font-medium">Faussaire</legend>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">
          Ce que le destinataire remarque paraît dans l'écriture du faussaire.
        </p>
        <Select items={choixFaussaire} value={faussaireChoisi} onValueChange={choisirFaussaire}>
          <SelectTrigger aria-label="Faussaire" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choixFaussaire.map((choix) => (
              <SelectItem key={choix.value} value={choix.value}>
                {choix.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mainInconnue && !version.faussaire_personnage_id && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-muted-foreground">
              L'écriture de cette main inconnue, parmi celles qu'aucun personnage n'utilise.
            </p>
            {ecrituresLibres.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Toutes les écritures sont prises par un personnage.
              </p>
            ) : (
              <div
                className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                role="group"
                aria-label="Écriture de la main inconnue"
              >
                {ecrituresLibres.map((ecriture) => (
                  <Pastille
                    key={ecriture.id}
                    actif={version.faussaire_ecriture_id === ecriture.id}
                    surChoix={() => changer({ faussaire_ecriture_id: ecriture.id })}
                    className="min-h-16 flex-col items-start justify-between gap-1 text-left"
                  >
                    <Main police={ecriture.police} className="line-clamp-1 text-base">
                      Une main inconnue
                    </Main>
                    <span className="text-xs text-muted-foreground">{ecriture.nom}</span>
                  </Pastille>
                ))}
              </div>
            )}
          </div>
        )}
      </fieldset>

      {destinataireNom !== undefined && (
        <fieldset>
          <legend className="text-sm font-medium">Remarqué par {destinataireNom}</legend>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">
            Par défaut, rien n'est remarqué : tout paraît normal. Un passage abîmé, lui, se voit
            toujours.
          </p>
          <div className="grid gap-3">
            <Detection
              id="remarque-texte"
              libelle="Les passages réécrits"
              possible={reecrits.length > 0}
              sinon="Rien n'est réécrit."
              valeur={version.remarque_texte}
              surValeur={(remarque_texte) => changer({ remarque_texte })}
            />
            <Detection
              id="remarque-sceau"
              libelle="Le sceau trafiqué"
              possible={sceauTrafique(version)}
              sinon="Le sceau n'est pas trafiqué."
              valeur={version.remarque_sceau}
              surValeur={(remarque_sceau) => changer({ remarque_sceau })}
            />
            {signaturesPossibles.length > 0 && (
              <Detection
                id="remarque-signature"
                libelle="La signature contrefaite"
                possible={version.signature_etat === 'contrefaite'}
                sinon="La signature n'est pas contrefaite."
                valeur={version.remarque_signature}
                surValeur={(remarque_signature) => changer({ remarque_signature })}
              />
            )}
          </div>
        </fieldset>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">
          {destinataireNom !== undefined
            ? `Ce que verra ${destinataireNom}`
            : 'Ce que verront les destinataires, tant que rien n’est remarqué'}
        </h3>
        <Apercu
          original={original}
          version={version}
          reecrits={reecrits}
          personnages={personnages}
          ecritures={ecritures}
          sceaux={sceaux}
          className="max-w-md"
        />
      </div>
    </div>
  );
}

/** Un interrupteur « remarqué » : il ne s'allume que s'il y a quelque chose à remarquer. */
function Detection({
  id,
  libelle,
  possible,
  sinon,
  valeur,
  surValeur,
}: {
  id: string;
  libelle: string;
  possible: boolean;
  /** Pourquoi l'interrupteur est éteint. */
  sinon: string;
  valeur: boolean;
  surValeur: (valeur: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Switch id={id} disabled={!possible} checked={possible && valeur} onCheckedChange={surValeur} />
      <Label htmlFor={id} className={cn(!possible && 'text-muted-foreground')}>
        {libelle}
        {!possible && <span className="font-normal"> · {sinon}</span>}
      </Label>
    </div>
  );
}

/**
 * La lettre telle que la lira le destinataire, avec le rendu des joueurs. Les règles sont
 * celles de la vue `plis_recus` : rien de non remarqué ne paraît, et un passage abîmé est
 * voilé.
 */
function Apercu({
  original,
  version,
  reecrits,
  personnages,
  ecritures,
  sceaux,
  className,
}: {
  original: OriginalVu;
  version: VersionLivree;
  reecrits: Passage[];
  personnages: PersonnageResume[];
  ecritures: EcritureMj[];
  sceaux: SceauMj[];
  className?: string;
}) {
  const policeDeLEcriture = (id: string | null | undefined) =>
    ecritures.find((ecriture) => ecriture.id === id)?.police ?? null;
  const policeDuPersonnage = (id: string | null) =>
    policeDeLEcriture(personnages.find((personnage) => personnage.id === id)?.ecriture_id);

  const policeFaussaire = version.faussaire_personnage_id
    ? policeDuPersonnage(version.faussaire_personnage_id)
    : policeDeLEcriture(version.faussaire_ecriture_id);
  const remarqueTexte = version.remarque_texte && reecrits.length > 0;
  const remarqueSceau = version.remarque_sceau && sceauTrafique(version);
  const contrefaite = version.signature_etat === 'contrefaite';
  const remarqueSignature = version.remarque_signature && contrefaite;

  const sceau = sceaux.find((candidat) => candidat.id === version.sceau_id);
  const signe = version.signature_etat === 'intacte' || contrefaite;
  const nomSigne =
    (version.signature_nom ?? '').trim() ||
    personnages.find((personnage) => personnage.id === version.signature_personnage_id)?.nom ||
    '';

  return (
    <Document
      className={className}
      contenu={voilerContenu(version.contenu, version.passages_abimes)}
      police={original.police}
      date={null}
      signature={
        signe && nomSigne !== ''
          ? {
              nom: nomSigne,
              police: remarqueSignature
                ? policeFaussaire
                : contrefaite
                  ? (policeDuPersonnage(version.signature_personnage_id) ?? original.police)
                  : original.police,
            }
          : null
      }
      sceau={
        sceau && version.sceau_etat
          ? {
              nom: sceau.nom_grave,
              initiales: sceau.initiales,
              etat: remarqueSceau ? version.sceau_etat : 'intact',
              image: sceau.image_id && adresseImageMj(sceau.image_id),
            }
          : null
      }
      passages={remarqueTexte ? reecrits : []}
      policeReecriture={policeFaussaire}
      passagesAbimes={version.passages_abimes}
      adresseImage={adresseImageMj}
    />
  );
}

// ---------------------------------------------------------------------------
// Une case de la version livrée
// ---------------------------------------------------------------------------

/**
 * Une case du document, telle qu'elle sera livrée : on la réécrit librement, et on y
 * abîme le passage sélectionné. Les passages réécrits et abîmés sont surlignés.
 */
function CaseLivree({
  champ,
  libelle,
  texte,
  origine,
  long,
  police,
  reecrits,
  abimes,
  surTexte,
  surAbimes,
}: {
  /** Le chemin de la case : `texte`, `articles.2.texte`… */
  champ: string;
  /** Vide : le document n'a qu'une case. */
  libelle: string | null;
  texte: string;
  /** Ce que l'auteur a écrit dans cette case. */
  origine: string;
  long: boolean;
  /** L'écriture d'un document écrit à la main. Vide : il est imprimé. */
  police: string | null;
  reecrits: Passage[];
  abimes: Passage[];
  surTexte: (texte: string) => void;
  surAbimes: (passages: Passage[]) => void;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const { famille, echelle } = policeDe(police);
  const trait =
    police === null
      ? { fontFamily: 'var(--police-texte)', fontSize: '1.05rem' }
      : { fontFamily: `${famille}, cursive`, fontSize: `${1.2 * echelle}rem` };
  const nom = libelle === null ? 'Version livrée' : `Version livrée : ${libelle}`;

  // Le champ grandit avec le texte : le surlignage, posé dessous, garde ainsi sa place.
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [texte, police]);

  function abimer() {
    const element = zone.current;
    if (!element || element.selectionStart === element.selectionEnd) {
      toast.info('Sélectionnez d’abord, dans la version livrée, le passage à abîmer.');
      return;
    }
    // Le champ compte en unités UTF-16 ; le serveur, en caractères.
    surAbimes([
      ...abimes,
      {
        champ,
        debut: enCaracteres(texte, element.selectionStart),
        fin: enCaracteres(texte, element.selectionEnd),
      },
    ]);
  }

  return (
    <div data-case={champ}>
      {libelle !== null && <p className="mb-1 text-sm text-muted-foreground">{libelle}</p>}
      <div className="relative overflow-hidden rounded-sm bg-card shadow-sm ring-1 ring-foreground/10">
        {/* Le surlignage : le même texte, invisible, posé sous le champ. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 px-4 py-3 leading-relaxed break-words whitespace-pre-wrap text-transparent"
          style={trait}
        >
          {morceaux(texte, reecrits, abimes).map((morceau, rang) => (
            <span
              key={rang}
              className={cn(
                morceau.abime ? 'rounded-sm bg-foreground/25' : morceau.reecrit && 'rounded-sm bg-bon/25',
              )}
            >
              {morceau.texte}
            </span>
          ))}
        </div>
        <textarea
          ref={zone}
          aria-label={nom}
          rows={long ? 3 : 1}
          spellCheck
          className="relative block w-full resize-none bg-transparent px-4 py-3 leading-relaxed break-words whitespace-pre-wrap outline-none"
          style={trait}
          value={texte}
          onChange={(e) => surTexte(e.target.value)}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size={libelle === null ? 'default' : 'sm'} onClick={abimer}>
          Abîmer la sélection
        </Button>
        {texte !== origine && (
          <Button
            type="button"
            variant="ghost"
            size={libelle === null ? 'default' : 'sm'}
            onClick={() => {
              surAbimes([]);
              surTexte(origine);
            }}
          >
            Reprendre le texte d'origine
          </Button>
        )}
      </div>

      {abimes.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2" aria-label="Passages abîmés">
          {abimes.map((passage) => (
            <li key={`${passage.debut}-${passage.fin}`}>
              <Badge variant="secondary" className="h-auto min-h-7 max-w-full gap-1 pr-1 text-sm">
                <span className="max-w-48 truncate">« {extrait(texte, passage)} »</span>
                <button
                  type="button"
                  aria-label="Ne plus abîmer ce passage"
                  className="rounded-full p-0.5 hover:bg-foreground/10"
                  onClick={() => surAbimes(abimes.filter((autre) => autre !== passage))}
                >
                  <XIcon className="size-3.5" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** L'image d'une carte, telle qu'elle sera livrée : le MJ peut en livrer une autre. */
function ImageLivree({
  image,
  origine,
  surImage,
}: {
  image: string;
  /** L'image de l'original. */
  origine: string | null;
  surImage: (image: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-sm text-muted-foreground">
        Image{origine !== null && image !== origine && ' · remplacée'}
      </p>
      <ChoixImage
        libelle="Image livrée"
        image={image === '' ? null : image}
        surImage={(choisie) => choisie && surImage(choisie)}
      />
      {origine !== null && image !== origine && (
        <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => surImage(origine)}>
          Reprendre l'image d'origine
        </Button>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        Rien ne signale au destinataire qu'une image a été remplacée.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L'historique
// ---------------------------------------------------------------------------

const GESTES: Record<string, string> = {
  envoi: 'Écrite par le MJ et mise en route',
  traitement: 'Traitée',
  modification: 'Acheminement modifié',
  copie: 'Copie mise en route',
  alteration: 'Altérée',
  destruction: 'Détruite par son destinataire',
  ecart: 'Écartée',
  retour_en_file: 'Remise dans la file',
};

function Historique({ evenements }: { evenements: Evenement[] }) {
  return (
    <Section titre="Historique" aide="Vous seul le voyez, comme l'original.">
      {evenements.length === 0 ? (
        <p className="text-muted-foreground">Rien n'est encore arrivé à ce pli.</p>
      ) : (
        <ol className="grid gap-3">
          {evenements.map((evenement, rang) => {
            const { avant, apres } = (evenement.details ?? {}) as {
              avant?: VersionLivree;
              apres?: VersionLivree;
            };
            return (
              <li key={rang} className="rounded-lg bg-background px-3 py-2 ring-1 ring-foreground/10">
                <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{GESTES[evenement.genre] ?? evenement.genre}</span>
                  <span className="text-sm text-muted-foreground">
                    {dateLisible(evenement.cree_le)}
                  </span>
                </p>
                {evenement.genre === 'alteration' && avant && apres && (
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      Voir l'avant et l'après
                    </summary>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <EtatDeVersion titre="Avant" version={avant} />
                      <EtatDeVersion titre="Après" version={apres} />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/** Le texte d'une version de l'historique. Avant l'étape 11, elle n'avait qu'un texte. */
function texteDeVersion(version: VersionLivree): string {
  const ancienne = version as unknown as { texte?: string };
  if (typeof ancienne.texte === 'string') return ancienne.texte;
  if (!version.contenu) return '';
  const { titre, texte } = resume(version.contenu);
  return [titre, texte].filter(Boolean).join('\n');
}

function EtatDeVersion({ titre, version }: { titre: string; version: VersionLivree }) {
  const remarque = [
    version.remarque_texte && 'le texte',
    version.remarque_sceau && 'le sceau',
    version.remarque_signature && 'la signature',
  ].filter(Boolean);
  return (
    <div className="min-w-0">
      <p className="font-medium">{titre}</p>
      <p className="mt-1 rounded-sm bg-card px-2 py-1.5 break-words whitespace-pre-wrap ring-1 ring-foreground/10">
        {texteDeVersion(version)}
      </p>
      <p className="mt-1 text-muted-foreground">
        Sceau : {ETATS_SCEAU.find(({ valeur }) => valeur === version.sceau_etat)?.libelle.toLowerCase() ?? 'aucun'}
        {' · '}signature : {ETATS_SIGNATURE[version.signature_etat].toLowerCase()}
        {version.passages_abimes.length > 0 &&
          ` · ${version.passages_abimes.length} passage${version.passages_abimes.length > 1 ? 's' : ''} abîmé${version.passages_abimes.length > 1 ? 's' : ''}`}
        {' · '}remarqué : {remarque.length > 0 ? remarque.join(', ') : 'rien'}
      </p>
    </div>
  );
}
