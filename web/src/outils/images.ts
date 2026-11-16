/**
 * Les images : où les demander, et comment en déposer une.
 *
 * Aucune image n'a d'adresse publique : le serveur les sert lui-même, après avoir vérifié
 * que la personne a le droit de les voir. Un joueur ne demande l'image d'un document qu'à
 * travers le pli qui la contient.
 */
import { ErreurApi } from '@/api';
import type { ImageMj } from '@/types/ImageMj';

/** Une image, pour le MJ : il les voit toutes. */
export const adresseImageMj = (image: string) => `/api/mj/images/${image}`;

/** L'image d'un sceau que le joueur voit : sur un pli reçu, ou parmi les siens. */
export const adresseSceauJoueur = (image: string) => `/api/joueur/sceaux/${image}`;

/** Les images d'un pli ouvert par le joueur. */
export const adresseImageDuPli = (pli: string) => (image: string) =>
  `/api/joueur/plis/${pli}/images/${image}`;

/** Le plus grand côté d'une image envoyée, en pixels. */
const COTE_MAX = 2000;
/** Le poids d'une image envoyée : le serveur refuse au-delà de 4 Mo. */
const POIDS_MAX = 4 * 1024 * 1024;

const ACCEPTEES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Les fichiers qu'un champ d'envoi d'image propose. */
export const IMAGES_ACCEPTEES = ACCEPTEES.join(',');

type Preparee = { fichier: Blob; largeur: number; hauteur: number };

const versBlob = (toile: HTMLCanvasElement, type: string, qualite?: number) =>
  new Promise<Blob | null>((fini) => toile.toBlob(fini, type, qualite));

/**
 * Prépare une image avant l'envoi : si elle est trop grande ou trop lourde, elle est
 * réduite à 2 000 pixels de côté au plus. Une image qui convient part telle quelle.
 */
async function preparer(fichier: File): Promise<Preparee> {
  if (!ACCEPTEES.includes(fichier.type)) {
    throw new ErreurApi(0, 'refus', 'Choisissez une image PNG, JPEG, WebP ou GIF.');
  }
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    throw new ErreurApi(0, 'refus', 'Ce fichier ne se lit pas comme une image.');
  }
  const { width: largeur, height: hauteur } = image;
  if (Math.max(largeur, hauteur) <= COTE_MAX && fichier.size <= POIDS_MAX) {
    image.close();
    return { fichier, largeur, hauteur };
  }

  const echelle = Math.min(1, COTE_MAX / Math.max(largeur, hauteur));
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(largeur * echelle));
  toile.height = Math.max(1, Math.round(hauteur * echelle));
  toile.getContext('2d')?.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();

  // Une photo reste une photo ; le reste garde sa transparence tant que le poids le permet.
  const essais: [string, number?][] =
    fichier.type === 'image/jpeg'
      ? [['image/jpeg', 0.9], ['image/jpeg', 0.75]]
      : [['image/png'], ['image/webp', 0.9], ['image/jpeg', 0.85]];
  for (const [type, qualite] of essais) {
    const reduit = await versBlob(toile, type, qualite);
    // Un navigateur qui ne sait pas produire ce type en rend un autre : on passe au suivant.
    if (reduit && reduit.type === type && reduit.size <= POIDS_MAX) {
      return { fichier: reduit, largeur: toile.width, hauteur: toile.height };
    }
  }
  throw new ErreurApi(0, 'refus', 'Cette image est trop lourde, même réduite.');
}

/** Dépose une image dans le stockage du site. Réservé au MJ. */
export async function deposerImage(fichier: File): Promise<ImageMj> {
  const preparee = await preparer(fichier);
  let reponse: Response;
  try {
    reponse = await fetch(
      `/api/mj/images?largeur=${preparee.largeur}&hauteur=${preparee.hauteur}`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': preparee.fichier.type },
        body: preparee.fichier,
      },
    );
  } catch {
    throw new ErreurApi(0, 'reseau', 'Le site est injoignable. Vérifiez votre connexion.');
  }
  if (!reponse.ok) {
    const detail = (await reponse.json().catch(() => null)) as {
      erreur?: string;
      message?: string;
    } | null;
    throw new ErreurApi(
      reponse.status,
      detail?.erreur ?? 'inconnue',
      detail?.message ??
        (reponse.status === 413
          ? 'Cette image est trop lourde : 4 Mo au plus.'
          : "L'image n'a pas pu être déposée. Réessayez dans un instant."),
    );
  }
  return (await reponse.json()) as ImageMj;
}
