import { Badge } from '@/components/ui/badge';
import { useLecture } from '@/outils/useLecture';
import type { PliDetruit } from '@/types/PliDetruit';

import { Attente, Entete } from './commun';
import { dateLisible, Lettre } from './courrier';

/**
 * Les plis que les joueurs ont détruits. Ils ont disparu pour eux, pas pour le MJ.
 * L'écran complet des correspondances viendra à l'étape 13.
 */
export function Detruits() {
  const { donnees, erreur } = useLecture<PliDetruit[]>('/mj/detruits');

  if (!donnees) return <Attente erreur={erreur} />;

  return (
    <>
      <Entete titre="Détruites par les joueurs" />
      <p className="mb-6 text-muted-foreground">
        Un joueur peut détruire une lettre reçue, seule ou avec tout un dossier. Elle disparaît pour
        lui ; vous la gardez ici, dans la version qu'il avait reçue.
      </p>

      {donnees.length === 0 ? (
        <p className="text-muted-foreground">Aucune lettre détruite.</p>
      ) : (
        <ul className="grid gap-6">
          {donnees.map((pli) => (
            <li key={pli.id}>
              <h3 className="font-medium">
                {pli.auteur_nom ?? 'Auteur inconnu'} à {pli.destinataire_nom}
              </h3>
              <div className="mt-1 mb-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">Détruite le {dateLisible(pli.detruit_le)}</Badge>
                {!pli.ouvert && <Badge variant="outline">Sans avoir été lue</Badge>}
                <Badge variant="outline">
                  {pli.dossier ? `Depuis le dossier « ${pli.dossier} »` : 'Depuis la Réception'}
                </Badge>
                <span>Arrivée le {dateLisible(pli.arrive_le)}</span>
              </div>
              <Lettre
                texte={pli.texte}
                police={pli.police}
                signature={pli.signature}
                sceau={pli.sceau}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
