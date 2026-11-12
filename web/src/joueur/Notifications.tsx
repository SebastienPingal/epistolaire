import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import { messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Attente } from '@/composants/Attente';
import { RefusNavigateur, useNotifications } from '@/outils/notifications';
import { vocabulaire } from '@/theme/neutre';
import type { MesNotifications } from '@/types/MesNotifications';

const mots = vocabulaire.notifications;

/**
 * Le premier choix des canaux, proposé une fois après la connexion.
 * « Plus tard » enregistre un choix vide : il n'est plus reproposé.
 */
export function PremierChoix({ surFin }: { surFin: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 md:py-12">
      <h1 className="mb-3 font-serif text-2xl">{mots.titrePremierChoix}</h1>
      <p className="mb-8 text-pretty text-muted-foreground">{mots.introPremierChoix}</p>
      <ChoixDesNotifications premierChoix surFin={surFin} />
    </main>
  );
}

/** Les canaux du joueur : la notification sur cet appareil, et les deux e-mails. */
export function ChoixDesNotifications({
  premierChoix = false,
  surFin,
}: {
  premierChoix?: boolean;
  surFin?: () => void;
}) {
  const notifications = useNotifications('joueur');
  const { mes, erreur } = notifications;
  if (!mes) return <Attente erreur={erreur} />;
  return <Formulaire {...notifications} mes={mes} premierChoix={premierChoix} surFin={surFin} />;
}

function Formulaire({
  mes,
  ici,
  etat,
  changerNavigateur,
  choisir,
  premierChoix,
  surFin,
}: ReturnType<typeof useNotifications> & {
  mes: MesNotifications;
  premierChoix: boolean;
  surFin?: () => void;
}) {
  const [arrivee, setArrivee] = useState(mes.email_arrivee);
  const [rappel, setRappel] = useState(mes.email_rappel);
  const [heures, setHeures] = useState(String(mes.rappel_heures));
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculerNavigateur(actif: boolean) {
    setOccupe(true);
    setErreur(null);
    try {
      await changerNavigateur(actif);
    } catch (e) {
      // Une permission refusée change l'état affiché : pas besoin d'un message en plus.
      if (!(e instanceof RefusNavigateur)) setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrer(plusTard: boolean) {
    setOccupe(true);
    setErreur(null);
    try {
      await choisir({
        email_arrivee: !plusTard && arrivee,
        email_rappel: !plusTard && rappel,
        rappel_heures: Number(heures),
      });
      if (!premierChoix) toast.success(mots.enregistre);
      surFin?.();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  const aide =
    etat === 'a-installer'
      ? mots.aInstaller
      : etat === 'refuse'
        ? mots.refuse
        : etat === 'indisponible'
          ? mots.indisponible
          : mes.navigateur && !ici
            ? mots.navigateurAilleurs
            : mots.navigateurAide;

  const delais = mots.delais.map(({ heures, libelle }) => ({ value: String(heures), label: libelle }));

  return (
    <div className="grid gap-6">
      <Option id="notif-navigateur" libelle={mots.navigateur} aide={aide}>
        <Switch
          id="notif-navigateur"
          checked={ici}
          disabled={occupe || etat !== 'possible'}
          onCheckedChange={basculerNavigateur}
        />
      </Option>

      <Option id="notif-arrivee" libelle={mots.emailArrivee}>
        <Switch id="notif-arrivee" checked={arrivee} disabled={occupe} onCheckedChange={setArrivee} />
      </Option>

      <div className="grid gap-3">
        <Option id="notif-rappel" libelle={mots.emailRappel}>
          <Switch id="notif-rappel" checked={rappel} disabled={occupe} onCheckedChange={setRappel} />
        </Option>
        {rappel && (
          <div className="flex flex-wrap items-center gap-3 pl-0.5">
            <Label htmlFor="notif-delai" className="font-normal text-muted-foreground">
              {mots.delaiRappel}
            </Label>
            <Select
              items={delais}
              value={heures}
              onValueChange={(valeur) => valeur && setHeures(valeur)}
            >
              <SelectTrigger id="notif-delai" className="h-11 min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {delais.map((delai) => (
                  <SelectItem key={delai.value} value={delai.value}>
                    {delai.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <p className="text-sm text-pretty text-muted-foreground">{mots.sansRien}</p>

      {erreur && (
        <p role="alert" className="text-destructive">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button className="h-11" disabled={occupe} onClick={() => enregistrer(false)}>
          {mots.enregistrer}
        </Button>
        {premierChoix && (
          <Button variant="outline" className="h-11" disabled={occupe} onClick={() => enregistrer(true)}>
            {mots.plusTard}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Une ligne de choix : le libellé (qui se touche aussi), l'interrupteur, et une aide. */
function Option({
  id,
  libelle,
  aide,
  children,
}: {
  id: string;
  libelle: string;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label htmlFor={id} className="text-base font-normal">
          {libelle}
        </Label>
        {children}
      </div>
      {aide && <p className="text-sm text-pretty text-muted-foreground">{aide}</p>}
    </div>
  );
}
