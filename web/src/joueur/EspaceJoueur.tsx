import { FeatherIcon, MailIcon, ScrollTextIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { cn } from '@/lib/utils';
import { usePastille } from '@/outils/notifications';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { MesNotifications } from '@/types/MesNotifications';

import { PremierChoix } from './Notifications';

const mots = vocabulaire.navigation;

type Entree = {
  chemin: string;
  libelle: string;
  Icone: ComponentType<{ className?: string }>;
  /** D'autres écrans qui appartiennent à cette destination. */
  aussi?: string[];
  /** Cette destination porte la pastille des plis non ouverts. */
  pastille?: boolean;
};

const ENTREES: Entree[] = [
  {
    chemin: '/reception',
    libelle: mots.reception,
    Icone: MailIcon,
    aussi: ['/dossiers', '/pli'],
    pastille: true,
  },
  { chemin: '/ecrire', libelle: mots.ecrire, Icone: FeatherIcon },
  { chemin: '/personnage', libelle: mots.personnage, Icone: ScrollTextIcon },
];

/**
 * Le cadre des écrans d'un joueur : une colonne, et trois destinations.
 * Sur téléphone la navigation est en bas, sous le pouce ; sur ordinateur, en haut.
 * À la première connexion, le choix des notifications passe avant tout le reste.
 */
export function EspaceJoueur() {
  const { pathname } = useLocation();
  const notifications = useLecture<MesNotifications>('/joueur/notifications');
  const [choixFait, setChoixFait] = useState(false);
  const enAttente = usePastille('joueur') > 0;

  if (notifications.donnees && !notifications.donnees.choisi && !choixFait) {
    return <PremierChoix surFin={() => setChoixFait(true)} />;
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <nav
        aria-label={vocabulaire.nomDuSite}
        className="sticky bottom-0 z-10 order-last border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:top-0 md:bottom-auto md:order-first md:border-t-0 md:border-b"
      >
        <ul className="mx-auto flex max-w-xl">
          {ENTREES.map(({ chemin, libelle, Icone, aussi = [], pastille }) => (
            <li key={chemin} className="flex-1">
              <NavLink
                to={chemin}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground outline-none focus-visible:bg-accent md:flex-row md:gap-2 md:text-sm',
                    (isActive || aussi.some((debut) => pathname.startsWith(debut))) &&
                      'text-foreground',
                  )
                }
              >
                <span className="relative">
                  <Icone className="size-5 md:size-4" />
                  {pastille && enAttente && (
                    <span
                      data-pastille
                      className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-sceau ring-2 ring-background"
                    />
                  )}
                </span>
                <span>{libelle}</span>
                {pastille && enAttente && <span className="sr-only">{vocabulaire.notifications.pastille}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
