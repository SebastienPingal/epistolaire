import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { type FormEvent, useState } from 'react';

import { appeler, messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { vocabulaire } from '@/theme/neutre';
import type { CodeConnexion } from '@/types/CodeConnexion';
import type { DemandeConnexion } from '@/types/DemandeConnexion';
import type { Moi } from '@/types/Moi';

const LONGUEUR_CODE = 6;
const mots = vocabulaire.connexion;

type Props = {
  /** Un message à montrer d'emblée, par exemple un lien expiré. */
  messageInitial?: string;
  surConnexion: (moi: Moi) => void;
};

/** L'écran de connexion : une adresse, puis le code reçu par e-mail. */
export function Connexion({ messageInitial, surConnexion }: Props) {
  const [etape, setEtape] = useState<'adresse' | 'code'>('adresse');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(messageInitial ?? null);

  async function demander(evenement: FormEvent) {
    evenement.preventDefault();
    setOccupe(true);
    setErreur(null);
    try {
      await appeler('/connexion/demande', { email } satisfies DemandeConnexion);
      setCode('');
      setEtape('code');
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function verifier(saisie: string) {
    setOccupe(true);
    setErreur(null);
    try {
      const moi = await appeler<Moi>('/connexion/code', {
        email,
        code: saisie,
      } satisfies CodeConnexion);
      surConnexion(moi);
    } catch (e) {
      setErreur(messageErreur(e));
      setCode('');
      setOccupe(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-4 py-12">
      <h1 className="font-serif text-3xl text-balance">{vocabulaire.nomDuSite}</h1>

      {etape === 'adresse' ? (
        <form onSubmit={demander} className="flex flex-col gap-3">
          <Label htmlFor="email">{mots.adresse}</Label>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            autoFocus
            className="h-11 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" className="h-11" disabled={occupe}>
            {occupe ? mots.envoi : mots.demander}
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground">{mots.messageParti}</p>
          <Label htmlFor="code">{mots.code}</Label>
          <InputOTP
            id="code"
            maxLength={LONGUEUR_CODE}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            disabled={occupe}
            value={code}
            onChange={setCode}
            onComplete={verifier}
          >
            <InputOTPGroup>
              {Array.from({ length: LONGUEUR_CODE }, (_, rang) => (
                <InputOTPSlot key={rang} index={rang} className="size-11 text-lg" />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {occupe && <p className="text-muted-foreground">{mots.verification}</p>}
          <Button
            type="button"
            variant="ghost"
            className="self-start px-0"
            onClick={() => {
              setEtape('adresse');
              setErreur(null);
            }}
          >
            {mots.changerAdresse}
          </Button>
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-destructive">
          {erreur}
        </p>
      )}
    </main>
  );
}
