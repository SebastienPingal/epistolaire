import { DownloadIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { appeler, messageErreur } from '@/api';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLecture } from '@/outils/useLecture';
import type { CopieFaite } from '@/types/CopieFaite';
import type { Sauvegardes } from '@/types/Sauvegardes';

import { Section } from './commun';
import { dateLisible } from './courrier';

/** Une taille de fichier lisible : « 84 Ko », « 1,2 Mo ». */
function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} octets`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Les copies de la base : la liste, une copie faite sur-le-champ, et le téléchargement.
 * La copie quotidienne se fait seule, à 4 h du matin, heure de Paris.
 */
export function SectionSauvegardes() {
  const { donnees, erreur, recharger } = useLecture<Sauvegardes>('/mj/sauvegardes');
  const [occupe, setOccupe] = useState(false);
  const [echec, setEchec] = useState<string | null>(null);

  async function copierMaintenant() {
    setOccupe(true);
    setEchec(null);
    try {
      const copie = await appeler<CopieFaite>('/mj/sauvegardes', {});
      toast.success(`Copie faite (${tailleLisible(copie.taille)})`);
      await recharger();
    } catch (e) {
      setEchec(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  const garde = donnees?.jours_de_garde ?? 30;
  return (
    <Section
      titre="Sauvegardes"
      aide={`Une copie de toute la base est faite chaque jour à 4 h du matin, et gardée ${garde} jours. Si elle échoue, vous recevez un e-mail. Faites-en une à la main avant une manipulation risquée.`}
    >
      {!donnees ? (
        <p className={erreur ? 'text-destructive' : 'text-muted-foreground'}>
          {erreur ?? 'Chargement…'}
        </p>
      ) : !donnees.configure ? (
        <p className="rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
          Le stockage des copies n'est pas encore relié au site : aucune copie ne peut être faite.
        </p>
      ) : (
        <>
          <Button onClick={() => void copierMaintenant()} disabled={occupe}>
            {occupe ? 'Copie en cours…' : 'Faire une copie maintenant'}
          </Button>
          {echec && (
            <p role="alert" className="mt-4 text-destructive">
              {echec}
            </p>
          )}

          {donnees.copies.length === 0 ? (
            <p className="mt-4 text-muted-foreground">Aucune copie pour l'instant.</p>
          ) : (
            <ul className="mt-4 divide-y rounded-lg ring-1 ring-foreground/10" aria-label="Copies">
              {donnees.copies.map((copie) => (
                <li
                  key={copie.nom}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{dateLisible(copie.faite_le)}</span>{' '}
                    <span className="text-sm text-muted-foreground">
                      {tailleLisible(copie.taille)}
                    </span>
                  </span>
                  <a
                    href={`/api/mj/sauvegardes/${encodeURIComponent(copie.nom)}`}
                    download={`epistolaire-${copie.nom}`}
                    data-slot="button"
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-h-11 sm:min-h-0')}
                  >
                    <DownloadIcon />
                    Télécharger
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
