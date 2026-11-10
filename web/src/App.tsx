import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { appeler, messageErreur } from '@/api';
import { Connexion } from '@/ecrans/Connexion';
import { Billet } from '@/joueur/Billet';
import { Ecritoire } from '@/joueur/Ecritoire';
import { EspaceJoueur } from '@/joueur/EspaceJoueur';
import { Fiche } from '@/joueur/Fiche';
import { Reception } from '@/joueur/Reception';
import { Ecritures } from '@/mj/Ecritures';
import { EspaceMj } from '@/mj/EspaceMj';
import { Personnage } from '@/mj/Personnage';
import { Personnages } from '@/mj/Personnages';
import { Reglages } from '@/mj/Reglages';
import { Sceaux } from '@/mj/Sceaux';
import { vocabulaire } from '@/theme/neutre';
import type { LienConnexion } from '@/types/LienConnexion';
import type { Moi } from '@/types/Moi';

type Etat =
  | { etape: 'chargement' }
  | { etape: 'deconnecte'; message?: string }
  | { etape: 'connecte'; moi: Moi };

/** Le jeton d'un lien de connexion, si la page a été ouverte depuis l'e-mail. */
function jetonDuLien(): string | null {
  const adresse = new URL(window.location.href);
  return adresse.pathname === '/connexion' ? adresse.searchParams.get('jeton') : null;
}

export function App() {
  const [etat, setEtat] = useState<Etat>({ etape: 'chargement' });
  const demarre = useRef(false);

  useEffect(() => {
    // Un lien ne sert qu'une fois : ce démarrage ne doit jamais partir en double.
    if (demarre.current) return;
    demarre.current = true;

    const jeton = jetonDuLien();
    if (jeton) {
      // Le jeton quitte la barre d'adresse et l'historique dès qu'il est lu.
      window.history.replaceState(null, '', '/');
      appeler<Moi>('/connexion/lien', { jeton } satisfies LienConnexion)
        .then((moi) => setEtat({ etape: 'connecte', moi }))
        .catch((e) => setEtat({ etape: 'deconnecte', message: messageErreur(e) }));
      return;
    }

    appeler<Moi>('/moi')
      .then((moi) => setEtat({ etape: 'connecte', moi }))
      .catch(() => setEtat({ etape: 'deconnecte' }));
  }, []);

  async function deconnecter() {
    // Même si le serveur ne répond pas, on revient à l'écran de connexion.
    await appeler('/deconnexion', {}).catch(() => undefined);
    window.history.replaceState(null, '', '/');
    setEtat({ etape: 'deconnecte' });
  }

  switch (etat.etape) {
    case 'chargement':
      return (
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
          <p className="text-muted-foreground">{vocabulaire.connexion.lienEnCours}</p>
        </main>
      );
    case 'deconnecte':
      return (
        <Connexion
          messageInitial={etat.message}
          surConnexion={(moi) => setEtat({ etape: 'connecte', moi })}
        />
      );
    case 'connecte':
      return (
        <BrowserRouter>
          {etat.moi.role === 'mj' ? (
            <Routes>
              <Route path="/mj" element={<EspaceMj surDeconnexion={deconnecter} />}>
                <Route path="personnages" element={<Personnages />} />
                <Route path="personnages/:id" element={<Personnage />} />
                <Route path="ecritures" element={<Ecritures />} />
                <Route path="sceaux" element={<Sceaux />} />
                <Route path="reglages" element={<Reglages />} />
              </Route>
              <Route path="*" element={<Navigate to="/mj/personnages" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route element={<EspaceJoueur />}>
                <Route path="/reception" element={<Reception />} />
                <Route path="/ecrire" element={<Ecritoire />} />
                <Route path="/ecrire/:id" element={<Billet />} />
                <Route path="/personnage" element={<Fiche surDeconnexion={deconnecter} />} />
              </Route>
              <Route path="*" element={<Navigate to="/reception" replace />} />
            </Routes>
          )}
        </BrowserRouter>
      );
  }
}
