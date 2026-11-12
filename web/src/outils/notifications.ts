import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { appeler, messageErreur, modifier } from '@/api';
import type { ChoixNotifications } from '@/types/ChoixNotifications';
import type { CleNotifications } from '@/types/CleNotifications';
import type { MesNotifications } from '@/types/MesNotifications';
import type { Pastille } from '@/types/Pastille';

/** Le joueur et le MJ choisissent leurs canaux de la même façon, chacun à sa porte. */
export type Porte = 'joueur' | 'mj';

/**
 * Ce que ce navigateur permet :
 * - `possible` : il peut recevoir des notifications ;
 * - `a-installer` : un iPhone ou un iPad, hors du site installé sur l'écran d'accueil ;
 * - `refuse` : la personne a bloqué les notifications pour ce site ;
 * - `indisponible` : ce navigateur ne sait pas en recevoir.
 */
export type EtatNavigateur = 'possible' | 'a-installer' | 'refuse' | 'indisponible';

const estAppareilApple = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Le site est-il ouvert depuis son icône sur l'écran d'accueil ? */
export const estInstalle = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function etatNavigateur(): EtatNavigateur {
  const sait = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // Sur iPhone, les notifications n'existent que pour le site installé.
  if (estAppareilApple() && !estInstalle()) return 'a-installer';
  if (!sait) return 'indisponible';
  if (Notification.permission === 'denied') return 'refuse';
  return 'possible';
}

/** Enregistre le service worker, qui affiche les notifications. Sans effet là où il n'existe pas. */
export function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

async function abonnementIci(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const enregistrement = await navigator.serviceWorker.getRegistration();
  return (await enregistrement?.pushManager?.getSubscription()) ?? null;
}

const octets = (base64: string) => {
  const brut = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(brut, (c) => c.charCodeAt(0));
};

const memesOctets = (a: ArrayBuffer | null, b: Uint8Array) =>
  a !== null && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

/** Une raison montrable à la personne, quand l'abonnement échoue. */
export class RefusNavigateur extends Error {
  readonly raison: 'refuse' | 'indisponible';
  constructor(raison: 'refuse' | 'indisponible') {
    super(raison);
    this.raison = raison;
  }
}

/**
 * Abonne ce navigateur. Doit être appelé pendant un geste de la personne (un toucher, un clic) :
 * la demande de permission est la toute première chose faite.
 */
async function abonnerIci(porte: Porte) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new RefusNavigateur('refuse');

  const { cle } = await appeler<CleNotifications>('/notifications/cle');
  if (!cle) throw new RefusNavigateur('indisponible');
  const cleServeur = octets(cle);

  const enregistrement = await navigator.serviceWorker.ready;
  let abonnement = await enregistrement.pushManager.getSubscription();
  // Un ancien abonnement fait avec une autre clé ne servirait à rien.
  if (abonnement && !memesOctets(abonnement.options.applicationServerKey, cleServeur)) {
    await abonnement.unsubscribe();
    abonnement = null;
  }
  abonnement ??= await enregistrement.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: cleServeur,
  });
  await appeler(`/${porte}/abonnements`, abonnement.toJSON());
}

async function desabonnerIci(porte: Porte) {
  const abonnement = await abonnementIci();
  if (!abonnement) return;
  await appeler(`/${porte}/abonnements`, { endpoint: abonnement.endpoint }, 'DELETE');
  await abonnement.unsubscribe();
}

/**
 * Les canaux de notification du compte connecté, et les gestes pour les changer.
 * Le navigateur s'active appareil par appareil ; les e-mails valent pour tous.
 */
export function useNotifications(porte: Porte) {
  const [mes, setMes] = useState<MesNotifications | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ici, setIci] = useState(false);
  const [etat, setEtat] = useState<EtatNavigateur>(() => etatNavigateur());

  const recharger = useCallback(async () => {
    try {
      const [lus, abonnement] = await Promise.all([
        appeler<MesNotifications>(`/${porte}/notifications`),
        abonnementIci().catch(() => null),
      ]);
      setMes(lus);
      setIci(abonnement !== null && lus.navigateur);
      setErreur(null);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, [porte]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  /** Active ou coupe les notifications sur cet appareil. */
  async function changerNavigateur(actif: boolean) {
    if (actif) {
      await abonnerIci(porte).catch((e: unknown) => {
        setEtat(etatNavigateur());
        throw e;
      });
    } else {
      await desabonnerIci(porte);
    }
    await recharger();
  }

  async function choisir(choix: ChoixNotifications) {
    setMes(await modifier<MesNotifications>(`/${porte}/notifications`, choix));
  }

  return { mes, erreur, ici, etat, changerNavigateur, choisir };
}

/**
 * Le nombre de choses qui attendent (plis non ouverts, ou lettres à traiter).
 * Relu au changement d'écran, au retour sur l'onglet, et chaque minute tant que l'onglet
 * est visible. Sur le site installé, l'icône porte aussi la pastille.
 */
export function usePastille(porte: Porte): number {
  const [nombre, setNombre] = useState(0);
  const { pathname } = useLocation();

  useEffect(() => {
    let actif = true;
    const lire = () => {
      if (document.visibilityState !== 'visible') return;
      appeler<Pastille>(`/${porte}/pastille`)
        .then(({ nombre }) => actif && setNombre(nombre))
        .catch(() => undefined);
    };
    lire();
    const minute = window.setInterval(lire, 60_000);
    document.addEventListener('visibilitychange', lire);
    return () => {
      actif = false;
      window.clearInterval(minute);
      document.removeEventListener('visibilitychange', lire);
    };
  }, [porte, pathname]);

  useEffect(() => {
    const badge = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!badge.setAppBadge || !badge.clearAppBadge) return;
    // Pour le joueur, un simple point ; pour le MJ, le nombre.
    const pose = nombre === 0
      ? badge.clearAppBadge()
      : porte === 'joueur' ? badge.setAppBadge() : badge.setAppBadge(nombre);
    pose.catch(() => undefined);
  }, [nombre, porte]);

  return nombre;
}
