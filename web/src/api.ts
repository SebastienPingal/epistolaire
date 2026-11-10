/** Appelle le serveur. Tous les échanges avec lui passent par ici. */
export async function appeler<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(`/api${chemin}`, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...options?.headers },
  });

  if (!reponse.ok) {
    throw new Error(`Le serveur a répondu ${reponse.status} pour ${chemin}`);
  }
  return (await reponse.json()) as T;
}
