/** L'état d'un écran qui attend ses données, ou qui n'a pas pu les lire. */
export function Attente({ erreur }: { erreur: string | null }) {
  return erreur ? (
    <p role="alert" className="text-destructive">
      {erreur}
    </p>
  ) : (
    <p className="text-muted-foreground">Chargement…</p>
  );
}
