/** Une réponse d'erreur du serveur. `message` peut être montré tel quel à l'utilisateur. */
export class ErreurApi extends Error {
  readonly statut: number;
  readonly code: string;

  constructor(statut: number, code: string, message: string) {
    super(message);
    this.statut = statut;
    this.code = code;
  }
}

const MESSAGE_PAR_DEFAUT = "Quelque chose s'est mal passé. Réessayez dans un instant.";

/**
 * Appelle le serveur. Tous les échanges avec lui passent par ici.
 * Avec un `corps`, la requête est un envoi (POST) ; sinon c'est une lecture (GET).
 * `methode` sert aux modifications (PUT) et aux suppressions (DELETE).
 */
export async function appeler<Reponse = void>(
  chemin: string,
  corps?: unknown,
  methode?: 'PUT' | 'DELETE',
): Promise<Reponse> {
  let reponse: Response;
  try {
    reponse = await fetch(`/api${chemin}`, {
      method: methode ?? (corps === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
  } catch {
    throw new ErreurApi(0, 'reseau', 'Le site est injoignable. Vérifiez votre connexion.');
  }

  // La session a expiré en cours de route : on repart de l'écran de connexion.
  if (reponse.status === 401 && chemin.startsWith('/mj/')) {
    window.location.assign('/');
  }

  if (!reponse.ok) {
    const detail = (await reponse.json().catch(() => null)) as {
      erreur?: string;
      message?: string;
    } | null;
    throw new ErreurApi(
      reponse.status,
      detail?.erreur ?? 'inconnue',
      detail?.message ?? MESSAGE_PAR_DEFAUT,
    );
  }

  if (reponse.status === 204) {
    return undefined as Reponse;
  }
  return (await reponse.json()) as Reponse;
}

/** Le texte à montrer à l'utilisateur pour une erreur, quelle qu'elle soit. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof ErreurApi ? erreur.message : MESSAGE_PAR_DEFAUT;
}

export const modifier = <Reponse = void>(chemin: string, corps: unknown) =>
  appeler<Reponse>(chemin, corps, 'PUT');

export const supprimer = (chemin: string) => appeler(chemin, undefined, 'DELETE');
