import { cn } from '@/lib/utils';
import { vocabulaire } from '@/theme/neutre';
import type { Article } from '@/types/Article';
import type { GazetteContenu } from '@/types/GazetteContenu';

import { Ecrit } from './encre';
import { Feuille } from './Feuille';

const mots = vocabulaire.gabarits.gazette;

const a = (texte: string) => texte.trim() !== '';

/**
 * Une gazette : imprimée, sur une seule feuille, mise en page comme un journal.
 *
 * La place d'un article suit son rang : le premier fait la une, les deux suivants sont
 * les articles, les autres des brèves. Le courrier des lecteurs ferme la feuille, recopié
 * sans écriture ni sceau.
 *
 * Le nombre de colonnes suit la largeur de la feuille, pas celle de l'écran : une seule
 * sur téléphone, jusqu'à trois sur un grand écran. La feuille est un conteneur, et ses
 * cases s'adaptent à elle (`@2xl:`, `@4xl:`), qu'elle soit lue par un joueur ou montrée
 * dans un aperçu du MJ.
 */
export function GazetteLue({ contenu, className }: { contenu: GazetteContenu; className?: string }) {
  const [une, ...suite] = contenu.articles.map((article, rang) => ({ article, rang }));
  const articles = suite.slice(0, 2);
  const breves = suite.slice(2);

  // Toute la feuille suit la même grille, pour que les colonnes tombent les unes sous les
  // autres : deux sur un écran moyen ; sur un grand, trois, sauf quand deux articles sans
  // brèves partagent la ligne sous la une.
  const trois = breves.length > 0 || articles.length < 2;
  const colonnes = cn('@2xl:columns-2', trois && '@4xl:columns-3');

  return (
    <Feuille imprimee className={cn('@container', className)}>
      <Bandeau contenu={contenu} />

      {une && (
        <section className="py-5">
          {a(une.article.titre) && (
            <h3 className="mb-3 text-2xl leading-tight font-bold break-words text-balance @xl:text-3xl @4xl:mb-4 @4xl:text-center @4xl:text-4xl">
              <Ecrit champ={`articles.${une.rang}.titre`} texte={une.article.titre} />
            </h3>
          )}
          <Texte
            rang={une.rang}
            article={une.article}
            className={cn(
              'text-[1.05rem] first-letter:float-left first-letter:mt-1 first-letter:mr-2 first-letter:text-5xl first-letter:leading-[0.8] first-letter:font-bold',
              colonnes,
            )}
          />
        </section>
      )}

      {articles.length > 0 && (
        <div
          className={cn(
            'grid border-t border-foreground/40 @2xl:gap-x-8',
            articles.length === 2 && '@2xl:grid-cols-2',
            breves.length > 0 && '@4xl:grid-cols-3',
          )}
        >
          {articles.map(({ article, rang }, place) => (
            <section
              key={rang}
              className={cn(
                'relative py-5',
                place === 1 && 'border-t border-foreground/25 @2xl:border-t-0',
                place === 1 && FILET_A_GAUCHE_2XL,
              )}
            >
              <Titre rang={rang} article={article} className="text-xl @xl:text-2xl" />
              <Texte
                rang={rang}
                article={article}
                // Seul sous la une, il prend toute la largeur, en colonnes comme elle.
                className={cn(articles.length === 1 && colonnes)}
              />
            </section>
          ))}

          {breves.length > 0 && (
            // Sur un écran moyen, les brèves passent dessous, sur toute la largeur ; sur un
            // grand, elles font la troisième colonne, à côté des articles.
            <div
              className={cn(
                'relative border-t border-foreground/40 py-5 @2xl:col-span-2 @4xl:col-span-1 @4xl:border-t-0',
                FILET_A_GAUCHE_4XL,
              )}
            >
              <div className={cn('gap-8 @2xl:columns-2 @4xl:columns-1', FILET_ENTRE_COLONNES)}>
                {breves.map(({ article, rang }) => (
                  <section
                    key={rang}
                    className="break-inside-avoid border-b border-foreground/15 pb-3 not-first:pt-3 last:border-b-0"
                  >
                    <Titre
                      rang={rang}
                      article={article}
                      className="text-sm tracking-wide uppercase"
                    />
                    <Texte rang={rang} article={article} className="text-sm" />
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {contenu.courrier.length > 0 && (
        <section className="border-y-4 border-double border-foreground/60 py-3">
          <h3 className="mb-3 text-center text-sm font-bold tracking-widest uppercase">
            {mots.courrier}
          </h3>
          <div className={cn('gap-8', colonnes, FILET_ENTRE_COLONNES)}>
            {contenu.courrier.map((lettre, rang) => (
              <blockquote key={rang} className="mb-4 break-inside-avoid last:mb-0">
                <p className="text-sm leading-relaxed break-words whitespace-pre-wrap italic">
                  <Ecrit champ={`courrier.${rang}.texte`} texte={lettre.texte} />
                </p>
                <footer className="mt-1 text-right text-sm text-muted-foreground">
                  —{' '}
                  {lettre.signature === null ? (
                    mots.anonyme
                  ) : (
                    <Ecrit champ={`courrier.${rang}.signature`} texte={lettre.signature} />
                  )}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}
    </Feuille>
  );
}

/*
 * Les filets verticaux. Entre deux colonnes de texte, le filet est au milieu de l'écart
 * (2rem) ; entre deux cases de la grille, il est tracé à la même place, à 1rem à gauche de
 * la case, pour que tous les filets d'une même colonne soient alignés.
 */
const FILET_ENTRE_COLONNES =
  '[column-rule:1px_solid_color-mix(in_oklab,var(--foreground)_25%,transparent)]';
const FILET_A_GAUCHE_2XL =
  '@2xl:before:absolute @2xl:before:inset-y-0 @2xl:before:-left-4 @2xl:before:border-l @2xl:before:border-foreground/25';
const FILET_A_GAUCHE_4XL =
  '@4xl:before:absolute @4xl:before:inset-y-0 @4xl:before:-left-4 @4xl:before:border-l @4xl:before:border-foreground/25';

/** Le haut de la feuille : le titre en grand, puis le numéro et la date entre deux filets. */
function Bandeau({ contenu }: { contenu: GazetteContenu }) {
  return (
    <header className="text-center">
      <div className="border-t-4 border-double border-foreground/70 pt-2 @2xl:pt-3">
        <h2 className="text-3xl leading-none font-bold tracking-wide break-words text-balance uppercase @xl:text-5xl @4xl:text-6xl">
          <Ecrit champ="titre" texte={contenu.titre} />
        </h2>
      </div>
      {(a(contenu.numero) || a(contenu.date)) && (
        <p className="mt-2 flex flex-wrap justify-between gap-x-4 border-y border-foreground/60 py-1 text-xs tracking-wide text-muted-foreground uppercase @xl:text-sm">
          <span>
            {a(contenu.numero) && (
              <>
                {mots.numero} <Ecrit champ="numero" texte={contenu.numero} />
              </>
            )}
          </span>
          <span>
            <Ecrit champ="date" texte={contenu.date} />
          </span>
        </p>
      )}
    </header>
  );
}

type Case = { rang: number; article: Article; className?: string };

function Titre({ rang, article, className }: Case) {
  if (!a(article.titre)) return null;
  return (
    <h4 className={cn('mb-1.5 leading-snug font-bold break-words text-balance', className)}>
      <Ecrit champ={`articles.${rang}.titre`} texte={article.titre} />
    </h4>
  );
}

/** Le corps d'un article. Justifié seulement quand la colonne est assez large. */
function Texte({ rang, article, className }: Case) {
  return (
    <p
      className={cn(
        'gap-8 leading-relaxed break-words hyphens-auto whitespace-pre-wrap @md:text-justify',
        FILET_ENTRE_COLONNES,
        className,
      )}
    >
      <Ecrit champ={`articles.${rang}.texte`} texte={article.texte} />
    </p>
  );
}
