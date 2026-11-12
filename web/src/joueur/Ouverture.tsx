import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import { messageErreur } from '@/api';
import { Cachet } from '@/composants/Cachet';
import { Enveloppe, Pliure } from '@/composants/Enveloppe';
import { cn } from '@/lib/utils';
import { useAuDoigt, useMouvementReduit } from '@/outils/useMedia';
import { vocabulaire } from '@/theme/neutre';
import type { Pli } from '@/types/Pli';
import type { SceauVu } from '@/types/SceauVu';

const mots = vocabulaire.pli;

/**
 * Au doigt : la part de la largeur du pli qu'il faut parcourir en glissant.
 * Le geste part du cachet, au milieu du pli : il doit pouvoir se faire d'un seul côté.
 */
const SEUIL_GLISSEMENT = 0.4;
/** À la souris ou au clavier : combien de temps maintenir, en millisecondes. */
const DUREE_MAINTIEN = 800;
/** Le temps que le cachet se brise avant que la lettre paraisse. */
const DUREE_BRIS = 450;

type Phase = 'repos' | 'geste' | 'ouverture';

type Props = {
  sceau: SceauVu | null;
  /** Demande l'ouverture au serveur, qui renvoie le contenu du pli. */
  ouvrir: () => Promise<Pli>;
  surOuvert: (pli: Pli) => void;
  surErreur: (message: string) => void;
};

/**
 * Le geste d'ouverture d'un pli.
 *
 * * Au doigt : glisser le cachet (ou la pliure) de côté. Il suit le doigt ; trop court,
 *   il revient à sa place.
 * * À la souris : maintenir le bouton. Un anneau se remplit autour du cachet ;
 *   relâcher avant annule.
 * * Au clavier : maintenir Espace ou Entrée sur le cachet, comme à la souris.
 *
 * Avec les animations réduites, rien ne bouge : la lettre paraît dès le geste fini.
 */
export function Ouverture({ sceau, ouvrir, surOuvert, surErreur }: Props) {
  const reduit = useMouvementReduit();
  const auDoigt = useAuDoigt();
  const zone = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>('repos');
  const [decalage, setDecalage] = useState(0);
  const [maintien, setMaintien] = useState(0);
  const [largeur, setLargeur] = useState(1);

  const decalageCourant = useRef(0);
  const glissement = useRef<{ pointeur: number; depart: number } | null>(null);
  const boucle = useRef<number | null>(null);
  const declenche = useRef(false);

  const arreterBoucle = () => {
    if (boucle.current !== null) {
      cancelAnimationFrame(boucle.current);
      boucle.current = null;
    }
  };
  useEffect(() => arreterBoucle, []);

  function remettreEnPlace() {
    arreterBoucle();
    glissement.current = null;
    decalageCourant.current = 0;
    setDecalage(0);
    setMaintien(0);
    setPhase('repos');
  }

  async function declencher() {
    if (declenche.current) return;
    declenche.current = true;
    arreterBoucle();
    setPhase('ouverture');
    try {
      const [pli] = await Promise.all([
        ouvrir(),
        new Promise((fini) => window.setTimeout(fini, reduit ? 0 : DUREE_BRIS)),
      ]);
      surOuvert(pli);
    } catch (e) {
      declenche.current = false;
      remettreEnPlace();
      surErreur(messageErreur(e));
    }
  }

  // --- Maintenir : souris et clavier --------------------------------------------
  function commencerMaintien() {
    if (declenche.current || boucle.current !== null) return;
    setPhase('geste');
    const depart = performance.now();
    const avancer = (maintenant: number) => {
      const avance = Math.min((maintenant - depart) / DUREE_MAINTIEN, 1);
      setMaintien(avance);
      if (avance >= 1) {
        boucle.current = null;
        void declencher();
        return;
      }
      boucle.current = requestAnimationFrame(avancer);
    };
    boucle.current = requestAnimationFrame(avancer);
  }

  function abandonnerMaintien() {
    if (!declenche.current) remettreEnPlace();
  }

  // --- Les pointeurs : doigt, stylet, souris -------------------------------------
  function surAppui(evenement: PointerEvent<HTMLDivElement>) {
    if (declenche.current) return;
    if (evenement.pointerType === 'mouse' && evenement.button !== 0) return;
    try {
      // Le geste continue même si le pointeur sort du pli.
      evenement.currentTarget.setPointerCapture(evenement.pointerId);
    } catch {
      // Un pointeur que le navigateur ne suit pas : le geste marche quand même, sans capture.
    }
    if (evenement.pointerType === 'mouse') {
      evenement.preventDefault();
      commencerMaintien();
      return;
    }
    setLargeur(zone.current?.offsetWidth ?? 1);
    glissement.current = { pointeur: evenement.pointerId, depart: evenement.clientX };
    setPhase('geste');
  }

  function surMouvement(evenement: PointerEvent<HTMLDivElement>) {
    const geste = glissement.current;
    if (!geste || geste.pointeur !== evenement.pointerId) return;
    decalageCourant.current = evenement.clientX - geste.depart;
    setDecalage(decalageCourant.current);
  }

  function surRelache(evenement: PointerEvent<HTMLDivElement>) {
    if (evenement.pointerType === 'mouse') {
      abandonnerMaintien();
      return;
    }
    const geste = glissement.current;
    if (!geste || geste.pointeur !== evenement.pointerId) return;
    glissement.current = null;
    const parcours = Math.abs(decalageCourant.current) / (zone.current?.offsetWidth ?? 1);
    if (parcours >= SEUIL_GLISSEMENT) {
      void declencher();
    } else {
      remettreEnPlace();
    }
  }

  // --- Le clavier ----------------------------------------------------------------
  const estTouche = (evenement: KeyboardEvent) => evenement.key === ' ' || evenement.key === 'Enter';

  function surToucheEnfoncee(evenement: KeyboardEvent) {
    if (!estTouche(evenement)) return;
    evenement.preventDefault();
    if (!evenement.repeat) commencerMaintien();
  }

  function surToucheRelachee(evenement: KeyboardEvent) {
    if (!estTouche(evenement)) return;
    evenement.preventDefault();
    abandonnerMaintien();
  }

  // --- Le rendu ------------------------------------------------------------------
  const ouverture = phase === 'ouverture';
  // Le cachet suit le doigt, sans sortir du pli.
  const limite = Math.max(largeur / 2 - 40, 0);
  // À l'ouverture, il se brise là où le doigt l'a laissé.
  const deplacement =
    glissement.current || ouverture ? Math.max(-limite, Math.min(limite, decalage)) : 0;
  const avance = glissement.current
    ? Math.min(Math.abs(decalage) / (SEUIL_GLISSEMENT * largeur), 1)
    : maintien;

  return (
    <div className="flex flex-col items-center gap-5">
      <div
        ref={zone}
        data-phase={phase}
        className={cn(
          'w-full max-w-sm cursor-grab touch-none select-none active:cursor-grabbing',
          ouverture && !reduit && 'scale-[1.02] opacity-0 transition duration-300 delay-150',
        )}
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={remettreEnPlace}
        onContextMenu={(evenement) => evenement.preventDefault()}
      >
        <Enveloppe>
          <div
            role="button"
            tabIndex={0}
            aria-label={mots.ouvrir}
            aria-describedby="consigne-ouverture"
            onKeyDown={surToucheEnfoncee}
            onKeyUp={surToucheRelachee}
            onBlur={abandonnerMaintien}
            className="relative rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
            style={{
              transform: `translateX(${deplacement}px)`,
              transition:
                glissement.current || reduit ? 'none' : 'transform 220ms ease-out',
            }}
          >
            <Anneau avance={ouverture ? 0 : avance} />
            {sceau ? (
              <CachetEnDeux sceau={sceau} brise={ouverture && !reduit} />
            ) : (
              <Pliure className="size-16 sm:size-20" />
            )}
          </div>
        </Enveloppe>
      </div>

      <p
        id="consigne-ouverture"
        role="status"
        className="max-w-sm text-center text-sm text-balance text-muted-foreground"
      >
        {ouverture
          ? mots.ouverture
          : auDoigt
            ? mots.gesteDoigt(sceau !== null)
            : mots.gesteSouris(sceau !== null)}
      </p>
    </div>
  );
}

/** L'anneau qui se remplit autour du cachet pendant le geste. */
function Anneau({ avance }: { avance: number }) {
  const rayon = 46;
  const tour = 2 * Math.PI * rayon;
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn(
        'pointer-events-none absolute -inset-2.5 -rotate-90',
        avance === 0 && 'opacity-0',
      )}
    >
      <circle
        cx="50"
        cy="50"
        r={rayon}
        fill="none"
        stroke="var(--foreground)"
        strokeOpacity="0.55"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={tour}
        strokeDashoffset={tour * (1 - avance)}
      />
    </svg>
  );
}

/** Le cachet, en deux moitiés qui se séparent quand il se brise. */
function CachetEnDeux({ sceau, brise }: { sceau: SceauVu; brise: boolean }) {
  const moitie = (cote: 'gauche' | 'droite') => (
    <span
      aria-hidden
      className="absolute inset-0 transition duration-[450ms] ease-out"
      style={{
        clipPath: cote === 'gauche' ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)',
        transform: brise
          ? cote === 'gauche'
            ? 'translate(-16px, 10px) rotate(-22deg)'
            : 'translate(16px, 10px) rotate(22deg)'
          : 'none',
        opacity: brise ? 0 : 1,
      }}
    >
      <Cachet
        initiales={sceau.initiales}
        nom={sceau.nom}
        etat={sceau.etat}
        className="size-full"
      />
    </span>
  );
  return (
    <span
      role="img"
      aria-label={`Sceau de ${sceau.nom}`}
      className="relative block size-16 sm:size-20"
    >
      {moitie('gauche')}
      {moitie('droite')}
    </span>
  );
}
