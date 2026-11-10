import { vocabulaire } from '@/theme/neutre';

const mots = vocabulaire.reception;

/** La Réception. Les plis y arriveront à l'étape « Le joueur reçoit ». */
export function Reception() {
  return (
    <>
      <h1 className="mb-6 font-serif text-2xl">{mots.titre}</h1>
      <p className="text-muted-foreground">{mots.vide}</p>
    </>
  );
}
