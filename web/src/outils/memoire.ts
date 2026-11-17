/**
 * Ce que le navigateur garde sur cet appareil, entre deux visites : un texte en cours
 * d'écriture, pour qu'une page fermée ou un réseau absent ne fasse rien perdre.
 *
 * Ce n'est qu'un filet de sécurité. Le stockage peut être refusé (navigation privée) ou
 * vidé à tout moment : chaque lecture et chaque écriture se passe de lui sans erreur.
 * Toutes les clés commencent par le même préfixe, et la déconnexion les efface toutes.
 */

const PREFIXE = 'epistolaire:';

/** Ce qui est gardé sous cette clé, ou rien. */
export function lireMemoire<T>(cle: string): T | null {
  try {
    const brut = window.localStorage.getItem(PREFIXE + cle);
    return brut === null ? null : (JSON.parse(brut) as T);
  } catch {
    return null;
  }
}

/** Garde une valeur sous cette clé. Dit si elle a bien été gardée. */
export function ecrireMemoire(cle: string, valeur: unknown): boolean {
  try {
    window.localStorage.setItem(PREFIXE + cle, JSON.stringify(valeur));
    return true;
  } catch {
    return false;
  }
}

export function oublierMemoire(cle: string) {
  try {
    window.localStorage.removeItem(PREFIXE + cle);
  } catch {
    // Rien à oublier.
  }
}

/** Efface tout ce que le site a gardé sur cet appareil : à la déconnexion. */
export function oublierToutesLesMemoires() {
  try {
    const stockage = window.localStorage;
    const cles = Array.from({ length: stockage.length }, (_, rang) => stockage.key(rang));
    for (const cle of cles) if (cle?.startsWith(PREFIXE)) stockage.removeItem(cle);
  } catch {
    // Rien à effacer.
  }
}
