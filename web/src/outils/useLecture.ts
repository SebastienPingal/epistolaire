import { useCallback, useEffect, useState } from 'react';

import { appeler, messageErreur } from '@/api';

type Lecture<T> = {
  /** Les données, ou `null` tant qu'elles ne sont pas arrivées. */
  donnees: T | null;
  erreur: string | null;
  /** Relit les données, après une modification par exemple. */
  recharger: () => Promise<void>;
};

/** Lit des données sur le serveur, et les garde à jour sur demande. */
export function useLecture<T>(chemin: string): Lecture<T> {
  const [donnees, setDonnees] = useState<T | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    try {
      setDonnees(await appeler<T>(chemin));
      setErreur(null);
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }, [chemin]);

  useEffect(() => {
    let actif = true;
    setDonnees(null);
    appeler<T>(chemin)
      .then((recu) => {
        if (actif) {
          setDonnees(recu);
          setErreur(null);
        }
      })
      .catch((e) => actif && setErreur(messageErreur(e)));
    return () => {
      actif = false;
    };
  }, [chemin]);

  return { donnees, erreur, recharger };
}
