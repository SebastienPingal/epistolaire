import { Navigate, Route, Routes } from 'react-router';

import { Billet } from './Billet';
import { Ecritoire } from './Ecritoire';
import { EspaceJoueur } from './EspaceJoueur';
import { Fiche } from './Fiche';
import { Pli } from './Pli';
import { DossierJoueur, Reception } from './Reception';

/** Tous les écrans d'un joueur. Ce fichier est chargé à part, sans les outils du MJ. */
export default function RoutesJoueur({ surDeconnexion }: { surDeconnexion: () => void }) {
  return (
    <Routes>
      <Route element={<EspaceJoueur />}>
        <Route path="/reception" element={<Reception />} />
        <Route path="/dossiers/:id" element={<DossierJoueur />} />
        <Route path="/pli/:id" element={<Pli />} />
        <Route path="/ecrire" element={<Ecritoire />} />
        <Route path="/ecrire/:id" element={<Billet />} />
        <Route path="/personnage" element={<Fiche surDeconnexion={surDeconnexion} />} />
      </Route>
      <Route path="*" element={<Navigate to="/reception" replace />} />
    </Routes>
  );
}
