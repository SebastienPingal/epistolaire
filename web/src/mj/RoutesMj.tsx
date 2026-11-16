import { Navigate, Route, Routes } from 'react-router';

import { Alteration } from './Alteration';
import { ATraiter } from './ATraiter';
import { Detruits } from './Detruits';
import { Documents } from './Documents';
import { Ecritures } from './Ecritures';
import { EnRoute } from './EnRoute';
import { EspaceMj } from './EspaceMj';
import { Personnage } from './Personnage';
import { Personnages } from './Personnages';
import { Reglages } from './Reglages';
import { Sceaux } from './Sceaux';
import { Traitement } from './Traitement';

/**
 * Tous les écrans du MJ. Ce fichier est chargé à part : un joueur ne télécharge jamais
 * le code des outils du MJ.
 */
export default function RoutesMj({ surDeconnexion }: { surDeconnexion: () => void }) {
  return (
    <Routes>
      <Route path="/mj" element={<EspaceMj surDeconnexion={surDeconnexion} />}>
        <Route path="a-traiter" element={<ATraiter />} />
        <Route path="a-traiter/:id" element={<Traitement />} />
        <Route path="en-route" element={<EnRoute />} />
        <Route path="en-route/:id" element={<Alteration />} />
        <Route path="documents" element={<Documents />} />
        <Route path="detruits" element={<Detruits />} />
        <Route path="personnages" element={<Personnages />} />
        <Route path="personnages/:id" element={<Personnage />} />
        <Route path="ecritures" element={<Ecritures />} />
        <Route path="sceaux" element={<Sceaux />} />
        <Route path="reglages" element={<Reglages />} />
      </Route>
      {/* À traiter est la page d'accueil du MJ. */}
      <Route path="*" element={<Navigate to="/mj/a-traiter" replace />} />
    </Routes>
  );
}
