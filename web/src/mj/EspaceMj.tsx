import {
  FeatherIcon,
  FlameIcon,
  InboxIcon,
  LogOutIcon,
  PenLineIcon,
  SendIcon,
  SettingsIcon,
  StampIcon,
  UsersIcon,
} from 'lucide-react';
import { type ComponentType, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { usePastille } from '@/outils/notifications';
import { useLecture } from '@/outils/useLecture';
import { vocabulaire } from '@/theme/neutre';
import type { MesNotifications } from '@/types/MesNotifications';

import { PremierChoixMj } from './Notifications';

type Entree = { chemin: string; libelle: string; Icone: ComponentType };

const COURRIER: Entree[] = [
  { chemin: '/mj/a-traiter', libelle: 'À traiter', Icone: InboxIcon },
  { chemin: '/mj/en-route', libelle: 'En route', Icone: SendIcon },
  { chemin: '/mj/ecrire', libelle: 'Écrire', Icone: FeatherIcon },
  { chemin: '/mj/detruits', libelle: 'Détruites', Icone: FlameIcon },
];

const PREPARATION: Entree[] = [
  { chemin: '/mj/personnages', libelle: 'Personnages', Icone: UsersIcon },
  { chemin: '/mj/ecritures', libelle: 'Écritures', Icone: PenLineIcon },
  { chemin: '/mj/sceaux', libelle: 'Sceaux', Icone: StampIcon },
  { chemin: '/mj/reglages', libelle: 'Réglages', Icone: SettingsIcon },
];

type Props = { surDeconnexion: () => void };

/**
 * Le cadre de tous les écrans du MJ : un menu, et l'écran choisi.
 * À la première connexion, le choix des notifications passe avant.
 */
export function EspaceMj({ surDeconnexion }: Props) {
  const { pathname } = useLocation();
  const courante = [...COURRIER, ...PREPARATION].find((entree) =>
    pathname.startsWith(entree.chemin),
  );
  const aTraiter = usePastille('mj');
  const notifications = useLecture<MesNotifications>('/mj/notifications');
  const [choixFait, setChoixFait] = useState(false);

  if (notifications.donnees && !notifications.donnees.choisi && !choixFait) {
    return <PremierChoixMj surFin={() => setChoixFait(true)} />;
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <p className="px-2 pt-2 font-serif text-lg">{vocabulaire.nomDuSite}</p>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Courrier</SidebarGroupLabel>
            <SidebarGroupContent>
              <Menu entrees={COURRIER} pastilles={{ '/mj/a-traiter': aTraiter }} />
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Préparation</SidebarGroupLabel>
            <SidebarGroupContent>
              <Menu entrees={PREPARATION} />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={surDeconnexion}>
                <LogOutIcon />
                <span>Se déconnecter</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3 md:hidden">
          <SidebarTrigger />
          <span className="font-medium">{courante?.libelle}</span>
          {aTraiter > 0 && !pathname.startsWith('/mj/a-traiter') && (
            <NavLink
              to="/mj/a-traiter"
              className="ml-auto flex min-h-11 items-center px-2 text-sm text-muted-foreground"
            >
              {aTraiter} à traiter
            </NavLink>
          )}
        </header>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Menu({
  entrees,
  pastilles = {},
}: {
  entrees: Entree[];
  /** Le nombre à afficher à côté d'une entrée, s'il n'est pas nul. */
  pastilles?: Record<string, number>;
}) {
  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarMenu>
      {entrees.map(({ chemin, libelle, Icone }) => (
        <SidebarMenuItem key={chemin}>
          <SidebarMenuButton
            isActive={pathname.startsWith(chemin)}
            // Sur téléphone, le menu se referme une fois la destination choisie.
            render={<NavLink to={chemin} onClick={() => setOpenMobile(false)} />}
          >
            <Icone />
            <span>{libelle}</span>
          </SidebarMenuButton>
          {(pastilles[chemin] ?? 0) > 0 && (
            <SidebarMenuBadge data-pastille>{pastilles[chemin]}</SidebarMenuBadge>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
