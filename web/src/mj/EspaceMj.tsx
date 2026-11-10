import { LogOutIcon, PenLineIcon, SettingsIcon, StampIcon, UsersIcon } from 'lucide-react';
import type { ComponentType } from 'react';
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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { vocabulaire } from '@/theme/neutre';

type Entree = { chemin: string; libelle: string; Icone: ComponentType };

const PREPARATION: Entree[] = [
  { chemin: '/mj/personnages', libelle: 'Personnages', Icone: UsersIcon },
  { chemin: '/mj/ecritures', libelle: 'Écritures', Icone: PenLineIcon },
  { chemin: '/mj/sceaux', libelle: 'Sceaux', Icone: StampIcon },
  { chemin: '/mj/reglages', libelle: 'Réglages', Icone: SettingsIcon },
];

type Props = { surDeconnexion: () => void };

/** Le cadre de tous les écrans du MJ : un menu, et l'écran choisi. */
export function EspaceMj({ surDeconnexion }: Props) {
  const { pathname } = useLocation();
  const courante = PREPARATION.find((entree) => pathname.startsWith(entree.chemin));

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <p className="px-2 pt-2 font-serif text-lg">{vocabulaire.nomDuSite}</p>
        </SidebarHeader>
        <SidebarContent>
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
        </header>
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:py-10">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Menu({ entrees }: { entrees: Entree[] }) {
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
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
