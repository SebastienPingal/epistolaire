import { ArrowLeftIcon } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { appeler, messageErreur, modifier, supprimer } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Attente } from '@/composants/Attente';
import { Cachet } from '@/composants/Cachet';
import { Confirmation } from '@/composants/Confirmation';
import { Main } from '@/composants/Main';
import { cn } from '@/lib/utils';
import { useLecture } from '@/outils/useLecture';
import { policeDe } from '@/theme/ecritures';
import { vocabulaire } from '@/theme/neutre';
import type { Brouillon } from '@/types/Brouillon';
import type { BrouillonSaisi } from '@/types/BrouillonSaisi';
import type { Destinataire } from '@/types/Destinataire';
import type { Ecritoire } from '@/types/Ecritoire';
import type { Envoi } from '@/types/Envoi';

const mots = vocabulaire.billet;

/** Délai sans frappe avant la sauvegarde automatique, en millisecondes. */
const PAUSE_AVANT_SAUVEGARDE = 700;

export function Billet() {
  const { id } = useParams();
  const ecritoire = useLecture<Ecritoire>('/joueur/ecritoire');
  const brouillon = useLecture<Brouillon>(`/joueur/brouillons/${id}`);

  if (!ecritoire.donnees || !brouillon.donnees) {
    return (
      <>
        <Retour />
        <Attente erreur={brouillon.erreur ?? ecritoire.erreur} />
      </>
    );
  }
  // La clé remet l'éditeur à neuf quand on change de brouillon.
  return (
    <Editeur key={brouillon.donnees.id} ecritoire={ecritoire.donnees} brouillon={brouillon.donnees} />
  );
}

function Retour() {
  return (
    <Link
      to="/ecrire"
      className="mb-4 inline-flex min-h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      {mots.retour}
    </Link>
  );
}

type Sauvegarde = 'a_jour' | 'en_cours' | 'echec';

function Editeur({ ecritoire, brouillon }: { ecritoire: Ecritoire; brouillon: Brouillon }) {
  const naviguer = useNavigate();
  const [saisie, setSaisie] = useState<BrouillonSaisi>({
    texte: brouillon.texte,
    destinataire: brouillon.destinataire,
    sceau_id: brouillon.sceau_id,
    signe: brouillon.signe,
  });
  const [sauvegarde, setSauvegarde] = useState<Sauvegarde>('a_jour');
  const [erreur, setErreur] = useState<string | null>(null);
  const [choixDestinataire, setChoixDestinataire] = useState(false);
  const [demande, setDemande] = useState<'envoi' | 'jet' | null>(null);
  const [parti, setParti] = useState(false);

  // --- Sauvegarde automatique -------------------------------------------------
  // `courante` suit la saisie ; `enregistree` est ce que le serveur a reçu en dernier.
  const courante = useRef(saisie);
  courante.current = saisie;
  const enregistree = useRef(JSON.stringify(saisie));
  const enCours = useRef<Promise<void> | null>(null);
  const termine = useRef(false);

  const sauvegarder = useCallback(async () => {
    // Une sauvegarde à la fois : la suivante attend, puis envoie le dernier état.
    while (enCours.current) await enCours.current;
    if (termine.current) return;
    const instantane = JSON.stringify(courante.current);
    if (instantane === enregistree.current) return;

    setSauvegarde('en_cours');
    enCours.current = modifier(`/joueur/brouillons/${brouillon.id}`, courante.current)
      .then(() => {
        enregistree.current = instantane;
        setSauvegarde('a_jour');
        setErreur(null);
      })
      .catch((e) => {
        setSauvegarde('echec');
        setErreur(messageErreur(e));
      })
      .finally(() => {
        enCours.current = null;
      });
    await enCours.current;
  }, [brouillon.id]);

  // Chaque changement relance le compte à rebours.
  useEffect(() => {
    const minuterie = window.setTimeout(() => void sauvegarder(), PAUSE_AVANT_SAUVEGARDE);
    return () => window.clearTimeout(minuterie);
  }, [saisie, sauvegarder]);

  // En quittant l'écran ou en changeant d'application : on sauvegarde sans attendre.
  useEffect(() => {
    const surMasquage = () => document.visibilityState === 'hidden' && void sauvegarder();
    document.addEventListener('visibilitychange', surMasquage);
    return () => {
      document.removeEventListener('visibilitychange', surMasquage);
      void sauvegarder();
    };
  }, [sauvegarder]);

  // --- État du billet ---------------------------------------------------------
  const longueur = [...saisie.texte].length;
  const deborde = longueur > ecritoire.longueur_billet;
  const remplissage = Math.min(longueur / ecritoire.longueur_billet, 1);
  const manque =
    saisie.texte.trim() === ''
      ? mots.manque.texte
      : deborde
        ? mots.deborde
        : saisie.destinataire === null
          ? mots.manque.destinataire
          : ecritoire.lettres_restantes === 0
            ? mots.manque.quota
            : null;

  async function repondre(confirme: boolean) {
    const geste = demande;
    setDemande(null);
    if (!confirme || !geste) return;
    try {
      if (geste === 'jet') {
        termine.current = true;
        await supprimer(`/joueur/brouillons/${brouillon.id}`);
        naviguer('/ecrire');
        return;
      }
      await sauvegarder();
      await appeler<Envoi>(`/joueur/brouillons/${brouillon.id}/envoi`, {});
      termine.current = true;
      setParti(true);
    } catch (e) {
      termine.current = false;
      setErreur(messageErreur(e));
    }
  }

  if (parti) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
        <p className="font-serif text-2xl text-balance">{mots.parti}</p>
        <Button variant="outline" className="h-11" onClick={() => naviguer('/ecrire')}>
          {mots.apresEnvoi}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Retour />

      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-muted-foreground">{mots.a}</span>
        <Button
          variant="ghost"
          className="h-auto min-h-9 justify-start px-2 text-base whitespace-normal underline decoration-dotted underline-offset-4"
          onClick={() => setChoixDestinataire(true)}
        >
          {nomDuDestinataire(saisie.destinataire, ecritoire) ?? mots.choisirDestinataire}
        </Button>
      </div>

      <Feuille
        texte={saisie.texte}
        police={ecritoire.police}
        signature={saisie.signe ? ecritoire.nom : null}
        remplissage={remplissage}
        deborde={deborde}
        surTexte={(texte) => setSaisie((avant) => ({ ...avant, texte }))}
      />

      <div className="mt-5 flex items-center gap-3">
        <Switch
          id="signer"
          checked={saisie.signe}
          onCheckedChange={(signe) => setSaisie((avant) => ({ ...avant, signe }))}
        />
        <Label htmlFor="signer">{mots.signer}</Label>
      </div>

      {ecritoire.sceaux.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">{mots.sceller}</legend>
          <div className="flex flex-wrap gap-2">
            <ChoixSceau
              actif={saisie.sceau_id === null}
              surChoix={() => setSaisie((avant) => ({ ...avant, sceau_id: null }))}
            >
              {mots.sansSceau}
            </ChoixSceau>
            {ecritoire.sceaux.map((sceau) => (
              <ChoixSceau
                key={sceau.id}
                actif={saisie.sceau_id === sceau.id}
                surChoix={() => setSaisie((avant) => ({ ...avant, sceau_id: sceau.id }))}
              >
                <Cachet initiales={sceau.initiales} nom={sceau.nom_grave} className="size-8" />
                {sceau.nom_grave}
              </ChoixSceau>
            ))}
          </div>
        </fieldset>
      )}

      <p role="status" className="mt-6 min-h-6 text-sm text-muted-foreground">
        {erreur ? (
          <span className="text-destructive">{erreur}</span>
        ) : (
          (manque ?? etatDeSauvegarde(sauvegarde))
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-3">
        <Button
          size="lg"
          className="h-11 min-w-32"
          disabled={manque !== null}
          onClick={() => setDemande('envoi')}
        >
          {mots.envoyer}
        </Button>
        <Button variant="ghost" size="lg" className="h-11" onClick={() => setDemande('jet')}>
          {mots.jeter}
        </Button>
      </div>

      <ChoixDestinataire
        ouvert={choixDestinataire}
        ecritoire={ecritoire}
        choisi={saisie.destinataire}
        surChoix={(destinataire) => {
          setChoixDestinataire(false);
          if (destinataire) setSaisie((avant) => ({ ...avant, destinataire }));
        }}
      />
      <Confirmation
        ouverte={demande === 'envoi'}
        destructrice={false}
        {...mots.confirmerEnvoi}
        surReponse={repondre}
      />
      <Confirmation ouverte={demande === 'jet'} {...mots.confirmerJet} surReponse={repondre} />
    </>
  );
}

function etatDeSauvegarde(sauvegarde: Sauvegarde): string {
  switch (sauvegarde) {
    case 'en_cours':
      return mots.enregistrement;
    case 'echec':
      return mots.nonEnregistre;
    case 'a_jour':
      return mots.enregistre;
  }
}

function nomDuDestinataire(destinataire: Destinataire | null, ecritoire: Ecritoire): string | null {
  switch (destinataire?.genre) {
    case 'personnage':
      return (
        ecritoire.carnet.find((contact) => contact.personnage_id === destinataire.id)?.nom ?? null
      );
    case 'gazette':
      return vocabulaire.gazette;
    case 'libre':
      return destinataire.adresse;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// La feuille : le texte, la signature, et la jauge
// ---------------------------------------------------------------------------

function Feuille({
  texte,
  police,
  signature,
  remplissage,
  deborde,
  surTexte,
}: {
  texte: string;
  police: string | null;
  signature: string | null;
  remplissage: number;
  deborde: boolean;
  surTexte: (texte: string) => void;
}) {
  const zone = useRef<HTMLTextAreaElement>(null);
  const { famille, echelle } = policeDe(police);

  // La feuille grandit avec le texte : on n'écrit jamais dans une fenêtre qui défile.
  useLayoutEffect(() => {
    const element = zone.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [texte, police]);

  return (
    <div className="overflow-hidden rounded-sm bg-card shadow-sm ring-1 ring-foreground/10">
      <div className="px-5 pt-5 pb-4">
        <textarea
          ref={zone}
          aria-label={mots.texte}
          placeholder={mots.invite}
          rows={6}
          autoFocus={texte === ''}
          spellCheck
          className="block w-full resize-none bg-transparent leading-relaxed outline-none placeholder:text-muted-foreground/70"
          style={{ fontFamily: `${famille}, cursive`, fontSize: `${1.25 * echelle}rem` }}
          value={texte}
          onChange={(e) => surTexte(e.target.value)}
        />
        {signature && (
          <p className="mt-3 text-right text-xl">
            <Main police={police}>{signature}</Main>
          </p>
        )}
      </div>

      {/* La jauge : discrète, sans chiffre. Elle ne rougit que si le billet déborde. */}
      <div
        role="meter"
        aria-label={mots.place}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(remplissage * 100)}
        aria-valuetext={deborde ? mots.deborde : mots.resteDeLaPlace}
        className="h-1 bg-muted"
      >
        <div
          className={cn(
            'h-full transition-[width] duration-200 motion-reduce:transition-none',
            deborde ? 'bg-destructive' : 'bg-foreground/35',
          )}
          style={{ width: `${remplissage * 100}%` }}
        />
      </div>
    </div>
  );
}

function ChoixSceau({
  actif,
  surChoix,
  children,
}: {
  actif: boolean;
  surChoix: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={surChoix}
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm ring-1 ring-foreground/10 outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring',
        actif && 'ring-2 ring-primary hover:ring-primary',
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Le choix du destinataire
// ---------------------------------------------------------------------------

function ChoixDestinataire({
  ouvert,
  ecritoire,
  choisi,
  surChoix,
}: {
  ouvert: boolean;
  ecritoire: Ecritoire;
  choisi: Destinataire | null;
  /** `null` : la fenêtre est fermée sans rien choisir. */
  surChoix: (destinataire: Destinataire | null) => void;
}) {
  const [adresse, setAdresse] = useState(choisi?.genre === 'libre' ? choisi.adresse : '');

  function choisirAutre(evenement: FormEvent) {
    evenement.preventDefault();
    if (adresse.trim() !== '') surChoix({ genre: 'libre', adresse: adresse.trim() });
  }

  const ligne =
    'flex min-h-12 w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent aria-pressed:bg-accent';

  return (
    <Dialog open={ouvert} onOpenChange={(etat) => !etat && surChoix(null)}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mots.choisirDestinataire}</DialogTitle>
        </DialogHeader>

        <div>
          <h3 className="mb-1 text-sm text-muted-foreground">{mots.carnet}</h3>
          {ecritoire.carnet.length === 0 ? (
            <p className="px-3 py-2 text-muted-foreground">{mots.carnetVide}</p>
          ) : (
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
              {ecritoire.carnet.map((contact) => (
                <li key={contact.personnage_id}>
                  <button
                    type="button"
                    className={ligne}
                    aria-pressed={
                      choisi?.genre === 'personnage' && choisi.id === contact.personnage_id
                    }
                    onClick={() => surChoix({ genre: 'personnage', id: contact.personnage_id })}
                  >
                    <span className="text-base">{contact.nom}</span>
                    {contact.qualite && (
                      <span className="text-sm text-muted-foreground">{contact.qualite}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          className={cn(ligne, 'rounded-lg text-base ring-1 ring-foreground/10')}
          aria-pressed={choisi?.genre === 'gazette'}
          onClick={() => surChoix({ genre: 'gazette' })}
        >
          {vocabulaire.gazette}
        </button>

        <form onSubmit={choisirAutre} className="grid gap-1.5">
          <Label htmlFor="autre-destinataire">{mots.autre}</Label>
          <div className="flex gap-2">
            <Input
              id="autre-destinataire"
              placeholder={mots.autreAide}
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={adresse.trim() === ''}>
              {mots.autreValider}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
