import { useState } from 'react';
import { toast } from 'sonner';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RefusNavigateur, useNotifications } from '@/outils/notifications';
import type { EssaiNotifications } from '@/types/EssaiNotifications';
import type { MesNotifications } from '@/types/MesNotifications';

import { Attente, Entete, Section } from './commun';

/** Le premier choix des canaux du MJ, proposé une fois après la connexion. */
export function PremierChoixMj({ surFin }: { surFin: () => void }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 md:py-12">
      <Entete titre="Mes notifications" />
      <p className="mb-8 text-muted-foreground">
        Être prévenu quand une lettre arrive dans la file, et alerté 2 heures avant la date de
        livraison proposée d'une lettre pas encore traitée. Modifiable ensuite dans les Réglages.
      </p>
      <ChoixMj premierChoix surFin={surFin} />
    </div>
  );
}

/** La section « Mes notifications » des Réglages. */
export function SectionNotificationsMj() {
  return (
    <Section
      titre="Mes notifications"
      aide="Les nouvelles lettres de la file, et une alerte 2 heures avant une date de livraison proposée, si la lettre n'est pas traitée. Plusieurs lettres font un seul message. Le passage se fait toutes les 15 minutes, sur le site en ligne seulement."
    >
      <ChoixMj />
    </Section>
  );
}

function ChoixMj({ premierChoix = false, surFin }: { premierChoix?: boolean; surFin?: () => void }) {
  const notifications = useNotifications('mj');
  if (!notifications.mes) return <Attente erreur={notifications.erreur} />;
  return (
    <Formulaire {...notifications} mes={notifications.mes} premierChoix={premierChoix} surFin={surFin} />
  );
}

const AIDE_NAVIGATEUR = {
  'a-installer':
    "Sur iPhone et iPad, il faut d'abord ajouter le site à l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), puis l'ouvrir depuis son icône.",
  refuse: 'Les notifications sont bloquées pour ce site dans les réglages du navigateur.',
  indisponible: 'Ce navigateur ne peut pas recevoir de notifications.',
} as const;

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
  const [email, setEmail] = useState(mes.email_arrivee);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function basculerNavigateur(actif: boolean) {
    setOccupe(true);
    setErreur(null);
    try {
      await changerNavigateur(actif);
    } catch (e) {
      if (!(e instanceof RefusNavigateur)) setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function essayer() {
    setOccupe(true);
    setErreur(null);
    try {
      const essai = await appeler<EssaiNotifications>('/mj/notifications/essai', {});
      const parties = [
        essai.navigateurs > 0 &&
          (essai.navigateurs === 1 ? 'une notification' : `${essai.navigateurs} notifications`),
        essai.email && 'un e-mail',
      ].filter(Boolean);
      if (parties.length === 0 && essai.echecs === 0) {
        toast('Aucun canal actif : rien à envoyer.');
      } else if (essai.echecs > 0) {
        toast.error(`Envoi refusé par ${essai.echecs === 1 ? 'un navigateur' : `${essai.echecs} navigateurs`}.`);
      } else {
        toast.success(`Parti : ${parties.join(' et ')}.`);
      }
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function enregistrer(plusTard: boolean) {
    setOccupe(true);
    setErreur(null);
    try {
      await choisir({
        email_arrivee: !plusTard && email,
        email_rappel: false,
        rappel_heures: mes.rappel_heures,
      });
      if (!premierChoix) toast.success('Enregistré');
      surFin?.();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  const aideNavigateur =
    etat === 'possible'
      ? mes.navigateur && !ici
        ? 'Activées sur un autre de vos appareils.'
        : 'Sur cet appareil seulement : à activer sur chacun.'
      : AIDE_NAVIGATEUR[etat];

  return (
    <div className="grid gap-5">
      <div>
        <div className="flex min-h-11 items-center justify-between gap-4">
          <Label htmlFor="mj-notif-navigateur">Notifications sur cet appareil</Label>
          <Switch
            id="mj-notif-navigateur"
            checked={ici}
            disabled={occupe || etat !== 'possible'}
            onCheckedChange={basculerNavigateur}
          />
        </div>
        <p className="text-sm text-muted-foreground">{aideNavigateur}</p>
      </div>

      <div className="flex min-h-11 items-center justify-between gap-4">
        <Label htmlFor="mj-notif-email">Un e-mail à chaque fois</Label>
        <Switch id="mj-notif-email" checked={email} disabled={occupe} onCheckedChange={setEmail} />
      </div>

      {erreur && (
        <p role="alert" className="text-destructive">
          {erreur}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button disabled={occupe} onClick={() => enregistrer(false)}>
          Enregistrer
        </Button>
        {premierChoix ? (
          <Button variant="outline" disabled={occupe} onClick={() => enregistrer(true)}>
            Plus tard
          </Button>
        ) : (
          <Button variant="outline" disabled={occupe} onClick={essayer}>
            M'envoyer un essai
          </Button>
        )}
      </div>
    </div>
  );
}
