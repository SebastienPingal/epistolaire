import { useSyncExternalStore } from 'react';

/** Vrai tant que l'appareil répond à cette requête média, et suivi en direct. */
export function useMedia(requete: string): boolean {
  return useSyncExternalStore(
    (prevenir) => {
      const media = window.matchMedia(requete);
      media.addEventListener('change', prevenir);
      return () => media.removeEventListener('change', prevenir);
    },
    () => window.matchMedia(requete).matches,
  );
}

/** L'appareil demande des animations réduites. */
export const useMouvementReduit = () => useMedia('(prefers-reduced-motion: reduce)');

/** L'appareil se pilote au doigt plutôt qu'à la souris. */
export const useAuDoigt = () => useMedia('(pointer: coarse)');
