/**
 * Les formulaires des gabarits : les cases d'un document, telles que le MJ les remplit.
 *
 * Chaque champ porte un identifiant tiré du chemin de sa case : `doc-texte`,
 * `doc-articles-0-titre`. Les cases répétées (articles, rubriques, lettres de lecteurs)
 * s'ajoutent, se retirent et changent d'ordre.
 */
import { ArrowDownIcon, ArrowUpIcon, ImageIcon, PlusIcon, XIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { messageErreur } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { adresseImageMj, deposerImage, IMAGES_ACCEPTEES } from '@/outils/images';
import { useLecture } from '@/outils/useLecture';
import type { Contenu } from '@/types/Contenu';
import type { ImageMj } from '@/types/ImageMj';

import { Champ } from './commun';

const idDe = (chemin: string) => `doc-${chemin.replaceAll('.', '-')}`;

const NOMS_DES_CASES: Record<string, string> = {
  texte: 'Texte',
  lieu_et_date: 'Lieu et date',
  titre: 'Titre',
  numero: 'Numéro',
  date: 'Date imprimée',
  autorite: 'Autorité',
  objet: 'Objet',
  formule_finale: 'Formule finale',
  auteur: 'Auteur',
  legende: 'Légende',
  signature: 'Nom imprimé',
};

const NOMS_DES_REPETEES: Record<string, string> = {
  articles: 'Article',
  rubriques: 'Rubrique',
  courrier: 'Lettre de lecteur',
};

/** Le nom d'une case, d'après son chemin : « Texte », « Article 2 · titre ». */
export function libelleDeLaCase(chemin: string): string {
  const [premier, rang, dernier] = chemin.split('.');
  if (dernier === undefined) return NOMS_DES_CASES[premier] ?? premier;
  const repetee = NOMS_DES_REPETEES[premier] ?? premier;
  return `${repetee} ${Number(rang) + 1} · ${(NOMS_DES_CASES[dernier] ?? dernier).toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Les champs
// ---------------------------------------------------------------------------

function Court({
  chemin,
  libelle,
  aide,
  valeur,
  surValeur,
}: {
  chemin: string;
  libelle: string;
  aide?: string;
  valeur: string;
  surValeur: (valeur: string) => void;
}) {
  return (
    <Champ libelle={libelle} pour={idDe(chemin)} aide={aide}>
      <Input id={idDe(chemin)} value={valeur} onChange={(e) => surValeur(e.target.value)} />
    </Champ>
  );
}

function Long({
  chemin,
  libelle,
  aide,
  valeur,
  surValeur,
  lignes = 5,
}: {
  chemin: string;
  libelle: string;
  aide?: ReactNode;
  valeur: string;
  surValeur: (valeur: string) => void;
  lignes?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={idDe(chemin)} className="text-sm leading-none font-medium">
        {libelle}
      </label>
      {/* Le champ grandit avec le texte (field-sizing). */}
      <Textarea
        id={idDe(chemin)}
        rows={lignes}
        spellCheck
        className="bg-card md:text-base"
        value={valeur}
        onChange={(e) => surValeur(e.target.value)}
      />
      {aide && <p className="text-sm text-muted-foreground">{aide}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Les cases répétées
// ---------------------------------------------------------------------------

function Repetees<T>({
  nom,
  elements,
  surElements,
  vierge,
  ajouter,
  minimum = 0,
  children,
}: {
  /** « l'article », « la rubrique » : pour les libellés des boutons. */
  nom: string;
  elements: T[];
  surElements: (elements: T[]) => void;
  vierge: T;
  /** Le libellé du bouton d'ajout. */
  ajouter: string;
  /** Le nombre d'éléments qu'il faut garder. */
  minimum?: number;
  children: (element: T, rang: number, changer: (changement: Partial<T>) => void) => ReactNode;
}) {
  const deplacer = (rang: number, vers: number) => {
    const suivants = [...elements];
    const [deplace] = suivants.splice(rang, 1);
    suivants.splice(vers, 0, deplace);
    surElements(suivants);
  };
  return (
    <div className="grid gap-3">
      {elements.map((element, rang) => (
        <div key={rang} className="rounded-lg bg-background p-3 ring-1 ring-foreground/10">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              {nom.charAt(0).toUpperCase() + nom.slice(1)} {rang + 1}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Monter ${nom} ${rang + 1}`}
                disabled={rang === 0}
                onClick={() => deplacer(rang, rang - 1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Descendre ${nom} ${rang + 1}`}
                disabled={rang === elements.length - 1}
                onClick={() => deplacer(rang, rang + 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer ${nom} ${rang + 1}`}
                disabled={elements.length <= minimum}
                onClick={() => surElements(elements.filter((_, autre) => autre !== rang))}
              >
                <XIcon />
              </Button>
            </span>
          </div>
          <div className="grid gap-3">
            {children(element, rang, (changement) =>
              surElements(
                elements.map((autre, position) =>
                  position === rang ? { ...autre, ...changement } : autre,
                ),
              ),
            )}
          </div>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" onClick={() => surElements([...elements, vierge])}>
          <PlusIcon />
          {ajouter}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Le choix d'une image
// ---------------------------------------------------------------------------

/**
 * Choisir une image : en déposer une nouvelle, ou en reprendre une déjà déposée.
 * `image` vide : aucune n'est choisie.
 */
export function ChoixImage({
  image,
  surImage,
  libelle = 'Image',
  compact = false,
}: {
  image: string | null;
  surImage: (image: string | null) => void;
  libelle?: string;
  /** Sans l'aperçu en grand : pour un sceau, ou dans une liste. */
  compact?: boolean;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [galerie, setGalerie] = useState(false);

  async function deposer(fichier: File | undefined) {
    if (!fichier) return;
    setOccupe(true);
    setErreur(null);
    try {
      const deposee = await deposerImage(fichier);
      surImage(deposee.id);
      setGalerie(false);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
      if (champ.current) champ.current.value = '';
    }
  }

  return (
    <div className="grid gap-2">
      {image && !compact && (
        <img
          src={adresseImageMj(image)}
          alt=""
          className="max-h-72 w-auto max-w-full rounded-sm ring-1 ring-foreground/10"
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={champ}
          type="file"
          accept={IMAGES_ACCEPTEES}
          aria-label={libelle}
          className="sr-only"
          onChange={(e) => void deposer(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" disabled={occupe} onClick={() => champ.current?.click()}>
          <ImageIcon />
          {occupe ? 'Envoi…' : image ? 'Changer d’image' : 'Choisir une image'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setGalerie((avant) => !avant)}>
          {galerie ? 'Fermer' : 'Images déjà déposées'}
        </Button>
        {image && compact && (
          <Button type="button" variant="ghost" onClick={() => surImage(null)}>
            Retirer l'image
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        PNG, JPEG, WebP ou GIF. Une grande image est réduite à 2 000 pixels de côté avant l'envoi.
      </p>
      {erreur && (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      )}
      {galerie && <Galerie choisie={image} surChoix={(choisie) => { surImage(choisie); setGalerie(false); }} />}
    </div>
  );
}

function Galerie({
  choisie,
  surChoix,
}: {
  choisie: string | null;
  surChoix: (image: string) => void;
}) {
  const { donnees, erreur } = useLecture<ImageMj[]>('/mj/images');
  if (!donnees) {
    return <p className="text-sm text-muted-foreground">{erreur ?? 'Chargement…'}</p>;
  }
  if (donnees.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune image n'a encore été déposée.</p>;
  }
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="Images déjà déposées">
      {donnees.map((image) => (
        <li key={image.id}>
          <button
            type="button"
            aria-pressed={image.id === choisie}
            aria-label={`Image de ${image.largeur} × ${image.hauteur} pixels`}
            onClick={() => surChoix(image.id)}
            className={cn(
              'block aspect-square w-full overflow-hidden rounded-sm ring-1 ring-foreground/10 outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring',
              image.id === choisie && 'ring-2 ring-primary',
            )}
          >
            <img
              src={adresseImageMj(image.id)}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Le formulaire d'un gabarit
// ---------------------------------------------------------------------------

/** Les cases d'un document, selon son gabarit. */
export function FormulaireContenu({
  contenu,
  surContenu,
  longueurBillet,
}: {
  contenu: Contenu;
  surContenu: (contenu: Contenu) => void;
  /** La longueur d'un billet de joueur. Le MJ peut la dépasser. */
  longueurBillet: number;
}) {
  switch (contenu.gabarit) {
    case 'billet': {
      const caracteres = [...contenu.texte].length;
      return (
        <Long
          chemin="texte"
          libelle="Texte"
          valeur={contenu.texte}
          surValeur={(texte) => surContenu({ ...contenu, texte })}
          aide={
            <span className={cn(caracteres > longueurBillet && 'text-destructive')}>
              {caracteres} / {longueurBillet} caractères
              {caracteres > longueurBillet &&
                ' : plus long qu’un billet de joueur. Vous seul le pouvez.'}
            </span>
          }
        />
      );
    }

    case 'lettre_longue':
      return (
        <div className="grid gap-4">
          <Court
            chemin="lieu_et_date"
            libelle="Lieu et date"
            aide="Facultatif. Écrit en haut de la lettre, de la main de l'auteur. Vide : la date du jeu."
            valeur={contenu.lieu_et_date}
            surValeur={(lieu_et_date) => surContenu({ ...contenu, lieu_et_date })}
          />
          <Long
            chemin="texte"
            libelle="Texte"
            lignes={10}
            valeur={contenu.texte}
            surValeur={(texte) => surContenu({ ...contenu, texte })}
          />
        </div>
      );

    case 'acte':
      return (
        <div className="grid gap-4">
          <Court
            chemin="autorite"
            libelle="Autorité"
            aide="Qui parle : « La Chancellerie du duché »."
            valeur={contenu.autorite}
            surValeur={(autorite) => surContenu({ ...contenu, autorite })}
          />
          <Court
            chemin="objet"
            libelle="Objet"
            valeur={contenu.objet}
            surValeur={(objet) => surContenu({ ...contenu, objet })}
          />
          <Long
            chemin="texte"
            libelle="Texte"
            lignes={8}
            valeur={contenu.texte}
            surValeur={(texte) => surContenu({ ...contenu, texte })}
          />
          <Long
            chemin="formule_finale"
            libelle="Formule finale"
            lignes={2}
            aide="Facultatif : « Fait pour valoir ce que de droit. »"
            valeur={contenu.formule_finale}
            surValeur={(formule_finale) => surContenu({ ...contenu, formule_finale })}
          />
        </div>
      );

    case 'rapport':
      return (
        <div className="grid gap-4">
          <Court
            chemin="titre"
            libelle="Titre"
            valeur={contenu.titre}
            surValeur={(titre) => surContenu({ ...contenu, titre })}
          />
          <Court
            chemin="auteur"
            libelle="Auteur"
            aide="Facultatif. Un nom imprimé sous le titre : ce n'est pas une signature."
            valeur={contenu.auteur}
            surValeur={(auteur) => surContenu({ ...contenu, auteur })}
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Rubriques</legend>
            <Repetees
              nom="la rubrique"
              ajouter="Ajouter une rubrique"
              minimum={1}
              vierge={{ titre: '', texte: '' }}
              elements={contenu.rubriques}
              surElements={(rubriques) => surContenu({ ...contenu, rubriques })}
            >
              {(rubrique, rang, changer) => (
                <>
                  <Court
                    chemin={`rubriques.${rang}.titre`}
                    libelle="Intertitre"
                    valeur={rubrique.titre}
                    surValeur={(titre) => changer({ titre })}
                  />
                  <Long
                    chemin={`rubriques.${rang}.texte`}
                    libelle="Texte"
                    lignes={4}
                    valeur={rubrique.texte}
                    surValeur={(texte) => changer({ texte })}
                  />
                </>
              )}
            </Repetees>
          </fieldset>
        </div>
      );

    case 'gazette':
      return (
        <div className="grid gap-4">
          <Court
            chemin="titre"
            libelle="Titre de la gazette"
            valeur={contenu.titre}
            surValeur={(titre) => surContenu({ ...contenu, titre })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Court
              chemin="numero"
              libelle="Numéro"
              valeur={contenu.numero}
              surValeur={(numero) => surContenu({ ...contenu, numero })}
            />
            <Court
              chemin="date"
              libelle="Date imprimée"
              valeur={contenu.date}
              surValeur={(date) => surContenu({ ...contenu, date })}
            />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Articles</legend>
            <Repetees
              nom="l'article"
              ajouter="Ajouter un article"
              minimum={1}
              vierge={{ titre: '', texte: '' }}
              elements={contenu.articles}
              surElements={(articles) => surContenu({ ...contenu, articles })}
            >
              {(article, rang, changer) => (
                <>
                  <Court
                    chemin={`articles.${rang}.titre`}
                    libelle="Titre"
                    valeur={article.titre}
                    surValeur={(titre) => changer({ titre })}
                  />
                  <Long
                    chemin={`articles.${rang}.texte`}
                    libelle="Texte"
                    lignes={4}
                    valeur={article.texte}
                    surValeur={(texte) => changer({ texte })}
                  />
                </>
              )}
            </Repetees>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium">Courrier des lecteurs</legend>
            <p className="mt-1 mb-2 text-sm text-muted-foreground">
              Des lettres recopiées, sans écriture ni sceau. Sans nom, la lettre est anonyme.
            </p>
            <Repetees
              nom="la lettre"
              ajouter="Ajouter une lettre de lecteur"
              vierge={{ texte: '', signature: null as string | null }}
              elements={contenu.courrier}
              surElements={(courrier) => surContenu({ ...contenu, courrier })}
            >
              {(lettre, rang, changer) => (
                <>
                  <Long
                    chemin={`courrier.${rang}.texte`}
                    libelle="Texte"
                    lignes={3}
                    valeur={lettre.texte}
                    surValeur={(texte) => changer({ texte })}
                  />
                  <Court
                    chemin={`courrier.${rang}.signature`}
                    libelle="Nom imprimé"
                    valeur={lettre.signature ?? ''}
                    surValeur={(signature) =>
                      changer({ signature: signature === '' ? null : signature })
                    }
                  />
                </>
              )}
            </Repetees>
          </fieldset>
        </div>
      );

    case 'carte':
      return (
        <div className="grid gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Image</legend>
            <ChoixImage
              image={contenu.image === '' ? null : contenu.image}
              surImage={(image) => surContenu({ ...contenu, image: image ?? '' })}
              libelle="Image de la carte"
            />
          </fieldset>
          <Court
            chemin="titre"
            libelle="Titre"
            aide="Facultatif."
            valeur={contenu.titre}
            surValeur={(titre) => surContenu({ ...contenu, titre })}
          />
          <Long
            chemin="legende"
            libelle="Légende"
            lignes={2}
            aide="Facultatif."
            valeur={contenu.legende}
            surValeur={(legende) => surContenu({ ...contenu, legende })}
          />
        </div>
      );
  }
}

/** Ce qui manque à un contenu pour partir, ou `null` s'il est prêt. */
export function manqueAuContenu(contenu: Contenu): string | null {
  const vide = (texte: string) => texte.trim() === '';
  switch (contenu.gabarit) {
    case 'billet':
      return vide(contenu.texte) ? 'Le billet est encore vide.' : null;
    case 'lettre_longue':
      return vide(contenu.texte) ? 'La lettre est encore vide.' : null;
    case 'acte':
      return vide(contenu.texte) ? 'L’acte est encore vide.' : null;
    case 'gazette':
      if (vide(contenu.titre)) return 'Donnez un titre à la gazette.';
      if (contenu.articles.some((article) => vide(article.texte))) return 'Un article est vide.';
      if (contenu.courrier.some((lettre) => vide(lettre.texte))) {
        return 'Une lettre du courrier des lecteurs est vide.';
      }
      return null;
    case 'rapport':
      if (vide(contenu.titre)) return 'Donnez un titre au rapport.';
      if (contenu.rubriques.some((rubrique) => vide(rubrique.texte))) return 'Une rubrique est vide.';
      return null;
    case 'carte':
      return contenu.image === '' ? 'Choisissez l’image de la carte.' : null;
  }
}
