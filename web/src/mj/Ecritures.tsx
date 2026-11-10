import { toast } from 'sonner';

import { messageErreur, modifier } from '@/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Main } from '@/composants/Main';
import { useLecture } from '@/outils/useLecture';
import { PHRASE_TEMOIN } from '@/theme/ecritures';
import type { EcritureMj } from '@/types/EcritureMj';
import type { EcritureModifiee } from '@/types/EcritureModifiee';

import { Attente, Entete } from './commun';

export function Ecritures() {
  const { donnees, erreur, recharger } = useLecture<EcritureMj[]>('/mj/ecritures');

  if (!donnees) return <Attente erreur={erreur} />;

  async function changer(ecriture: EcritureMj, changement: Partial<EcritureModifiee>) {
    try {
      await modifier(`/mj/ecritures/${ecriture.id}`, {
        nom: ecriture.nom,
        generique: ecriture.generique,
        ...changement,
      } satisfies EcritureModifiee);
    } catch (e) {
      toast.error(messageErreur(e));
    }
    await recharger();
  }

  return (
    <>
      <Entete titre="Écritures" />
      <p className="mb-6 text-muted-foreground">
        Chaque personnage écrit de sa main. Attribuez une écriture depuis la fiche d'un personnage.
        Une écriture générique peut servir à plusieurs PNJ secondaires.
      </p>

      <ul className="grid gap-3 sm:grid-cols-2">
        {donnees.map((ecriture) => (
          <li
            key={ecriture.id}
            className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          >
            <p className="min-h-16 text-lg">
              <Main police={ecriture.police}>{PHRASE_TEMOIN}</Main>
            </p>
            <Input
              aria-label="Nom de l'écriture"
              // La clé remet le champ à jour si le renommage est refusé.
              key={ecriture.nom}
              defaultValue={ecriture.nom}
              onBlur={(e) => {
                const nom = e.target.value.trim();
                if (nom !== '' && nom !== ecriture.nom) void changer(ecriture, { nom });
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {ecriture.utilisee_par.length > 0 ? ecriture.utilisee_par.join(', ') : 'Libre'}
              </p>
              <div className="flex items-center gap-2">
                <Label htmlFor={`generique-${ecriture.id}`} className="text-sm">
                  Générique
                </Label>
                <Switch
                  id={`generique-${ecriture.id}`}
                  checked={ecriture.generique}
                  onCheckedChange={(generique) => changer(ecriture, { generique })}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
