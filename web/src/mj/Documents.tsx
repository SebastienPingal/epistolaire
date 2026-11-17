import { PlusIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Document } from '@/composants/gabarits/Document';
import { contenuVierge, estManuscrit, seSigne } from '@/outils/gabarits';
import { adresseImageMj } from '@/outils/images';
import { useLecture } from '@/outils/useLecture';
import type { Contenu } from '@/types/Contenu';
import type { DocumentSaisi } from '@/types/DocumentSaisi';
import type { EcritureMj } from '@/types/EcritureMj';
import type { Gabarit } from '@/types/Gabarit';
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

const GABARITS: Gabarit[] = ['billet', 'lettre_longue', 'acte', 'rapport', 'gazette', 'carte'];

const DESCRIPTIONS: Record<Gabarit, string> = {
  billet: 'Écrit à la main. Signature et sceau.',
  lettre_longue: 'Écrite à la main. Lieu et date, signature et sceau.',
  acte: 'Écrit à la main. Autorité, objet, formule finale, signature et sceau.',
  rapport: 'Imprimé. Un titre et des rubriques.',
  gazette: 'Imprimée. Des articles et le courrier des lecteurs.',
  carte: 'Une image, son titre et sa légende.',
};

type Destinataire = { personnage_id: string; date: string };

/**
 * L'outil unique du MJ : tout ce qu'il envoie. Un gabarit, un expéditeur, un contenu, et
 * un ou plusieurs destinataires, chacun avec sa date. Le document part aussitôt, sans
 * passer par la file.
 */
export function Documents() {
  const naviguer = useNavigate();
  const personnages = useLecture<PersonnageResume[]>('/mj/personnages');
  const ecritures = useLecture<EcritureMj[]>('/mj/ecritures');
  const sceaux = useLecture<SceauMj[]>('/mj/sceaux');
  const reglages = useLecture<Reglages>('/mj/reglages');

  const [gabarit, setGabarit] = useState<Gabarit>('billet');
  // Chaque gabarit garde ce qu'on y a écrit : en changer ne fait rien perdre.
  const [contenus, setContenus] = useState<Partial<Record<Gabarit, Contenu>>>({});
  const [auteurId, setAuteurId] = useState<string | null>(null);
  const [sansExpediteur, setSansExpediteur] = useState(false);
  const [ecritureId, setEcritureId] = useState<string | null>(null);
  const [signe, setSigne] = useState(true);
  const [sceauId, setSceauId] = useState<string | null>(null);
  const [destinataires, setDestinataires] = useState<Destinataire[]>([]);
  const [dateCommune, setDateCommune] = useState('');
  const [creation, setCreation] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!personnages.donnees || !ecritures.donnees || !sceaux.donnees || !reglages.donnees) {
    return (
      <Attente
        erreur={personnages.erreur ?? ecritures.erreur ?? sceaux.erreur ?? reglages.erreur}
      />
    );
  }

  const tous = personnages.donnees;
  const pnj = tous.filter((personnage) => personnage.genre === 'pnj');
  const auteur = sansExpediteur ? null : (pnj.find((personnage) => personnage.id === auteurId) ?? null);
  const contenu = contenus[gabarit] ?? contenuVierge(gabarit);
  const manuscrit = estManuscrit(gabarit);

  // L'écriture : celle du PNJ s'il en a une ; sinon celle qu'on choisit ici.
  const ecritureAChoisir = manuscrit && (sansExpediteur || (auteur !== null && !auteur.ecriture_id));
  const ecriture = ecritures.donnees.find(
    (candidate) => candidate.id === (auteur?.ecriture_id ?? ecritureId),
  );
  const police = ecriture?.police ?? null;

  const sesSceaux = auteur ? sceaux.donnees.filter((sceau) => sceau.detenteur_id === auteur.id) : [];
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
    try {
      await appeler('/mj/documents', {
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
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  return (
    <>
      <Entete titre="Documents" />
      <p className="mb-6 text-muted-foreground">
        Tout ce que vous envoyez part d'ici. Le document part aussitôt, et chaque destinataire
        reçoit son exemplaire comme un pli ordinaire : fermé, dans sa Réception. Jusqu'à son
        arrivée, chaque exemplaire reste modifiable dans En route.
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
                  ecritures={ecritures.donnees}
                  choisie={ecritureId}
                  surChoix={setEcritureId}
                />
              )}
              <FormulaireContenu
                contenu={contenu}
                surContenu={(change) => setContenus((avant) => ({ ...avant, [gabarit]: change }))}
                longueurBillet={reglages.donnees.longueur_billet}
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

      <NouveauPnj
        ouvert={creation}
        surFermeture={async (cree) => {
          setCreation(false);
          if (!cree) return;
          await Promise.all([personnages.recharger(), sceaux.recharger()]);
          changerDAuteur(cree.id);
        }}
      />
    </>
  );
}
