import { useCallback, useEffect, useRef, useState } from 'react';

import { messageErreur } from '@/api';

/** Le temps sans frappe après lequel on enregistre. */
const PAUSE_AVANT_ENREGISTREMENT = 800;

export type EtatEnregistrement = 'a_jour' | 'en_cours' | 'echec';

type Enregistrement = {
  etat: EtatEnregistrement;
  erreur: string | null;
  /** Enregistre sans attendre la fin du compte à rebours : avant un envoi, par exemple. */
  enregistrerMaintenant: () => Promise<void>;
  /**
   * Plus rien ne part tant que c'est suspendu : pendant l'envoi ou le jet d'un brouillon,
   * qui le font disparaître du serveur. On reprend si le geste échoue.
   */
  suspendre: (suspendu: boolean) => void;
};

/**
 * Enregistre une valeur sur le serveur un instant après son dernier changement, en quittant
 * l'écran, et quand le réseau revient. Un seul enregistrement à la fois : le suivant
 * attend, puis envoie le dernier état.
 *
 * `depart` est ce que le serveur a déjà : tant que la valeur ne change pas, rien ne part.
 */
export function useEnregistrementAuto<T>(
  valeur: T,
  depart: T,
  enregistrer: (valeur: T) => Promise<void>,
): Enregistrement {
  const [etat, setEtat] = useState<EtatEnregistrement>('a_jour');
  const [erreur, setErreur] = useState<string | null>(null);

  const courante = useRef(valeur);
  courante.current = valeur;
  const enregistree = useRef(JSON.stringify(depart));
  const geste = useRef(enregistrer);
  geste.current = enregistrer;
  const enCours = useRef<Promise<void> | null>(null);
  const termine = useRef(false);

  const enregistrerMaintenant = useCallback(async () => {
    while (enCours.current) await enCours.current;
    if (termine.current) return;
    const instantane = JSON.stringify(courante.current);
    if (instantane === enregistree.current) return;

    setEtat('en_cours');
    enCours.current = geste
      .current(courante.current)
      .then(() => {
        enregistree.current = instantane;
        setEtat('a_jour');
        setErreur(null);
      })
      .catch((e) => {
        setEtat('echec');
        setErreur(messageErreur(e));
      })
      .finally(() => {
        enCours.current = null;
      });
    await enCours.current;
  }, []);

  // Chaque changement relance le compte à rebours.
  const instantane = JSON.stringify(valeur);
  useEffect(() => {
    const minuterie = window.setTimeout(
      () => void enregistrerMaintenant(),
      PAUSE_AVANT_ENREGISTREMENT,
    );
    return () => window.clearTimeout(minuterie);
  }, [instantane, enregistrerMaintenant]);

  // En quittant l'écran, en changeant d'onglet, ou quand le réseau revient.
  useEffect(() => {
    const surMasquage = () =>
      document.visibilityState === 'hidden' && void enregistrerMaintenant();
    const surReseau = () => void enregistrerMaintenant();
    document.addEventListener('visibilitychange', surMasquage);
    window.addEventListener('online', surReseau);
    return () => {
      document.removeEventListener('visibilitychange', surMasquage);
      window.removeEventListener('online', surReseau);
      void enregistrerMaintenant();
    };
  }, [enregistrerMaintenant]);

  const suspendre = useCallback((suspendu: boolean) => {
    termine.current = suspendu;
  }, []);

  return { etat, erreur, enregistrerMaintenant, suspendre };
}

/** Ce qu'on montre au MJ de l'enregistrement en cours. */
export function libelleEnregistrement(etat: EtatEnregistrement, erreur: string | null): string {
  switch (etat) {
    case 'a_jour':
      return 'Enregistré';
    case 'en_cours':
      return 'Enregistrement…';
    case 'echec':
      return `Pas encore enregistré : ${erreur ?? 'le site est injoignable'}. Nouvel essai au prochain changement.`;
  }
}
