import { vocabulaire } from '@/theme/neutre';
import type { GazetteContenu } from '@/types/GazetteContenu';

import { Ecrit } from './encre';
import { Feuille } from './Feuille';

const mots = vocabulaire.gabarits.gazette;

/**
 * Une gazette : imprimée. Son titre en bandeau, son numéro et sa date, ses articles, puis
 * le courrier des lecteurs, recopié sans écriture ni sceau.
 */
export function GazetteLue({ contenu, className }: { contenu: GazetteContenu; className?: string }) {
  const a = (texte: string) => texte.trim() !== '';
  return (
    <Feuille imprimee className={className}>
      <header className="border-y-2 border-foreground/70 py-3 text-center">
        <h2 className="text-3xl leading-tight font-bold tracking-wide break-words text-balance uppercase">
          <Ecrit champ="titre" texte={contenu.titre} />
        </h2>
      </header>
      {(a(contenu.numero) || a(contenu.date)) && (
        <p className="flex flex-wrap justify-between gap-x-4 border-b border-foreground/30 py-1.5 text-sm text-muted-foreground">
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

      <div className="mt-5 grid gap-6">
        {contenu.articles.map((article, rang) => (
          <section key={rang}>
            {a(article.titre) && (
              <h3 className="mb-1.5 text-xl leading-snug font-bold break-words text-balance">
                <Ecrit champ={`articles.${rang}.titre`} texte={article.titre} />
              </h3>
            )}
            <p className="text-justify leading-relaxed break-words hyphens-auto whitespace-pre-wrap">
              <Ecrit champ={`articles.${rang}.texte`} texte={article.texte} />
            </p>
          </section>
        ))}
      </div>

      {contenu.courrier.length > 0 && (
        <section className="mt-7 border-t-2 border-foreground/70 pt-3">
          <h3 className="mb-3 text-center text-sm font-bold tracking-widest uppercase">
            {mots.courrier}
          </h3>
          <div className="grid gap-4">
            {contenu.courrier.map((lettre, rang) => (
              <blockquote key={rang} className="border-l-2 border-foreground/20 pl-3">
                <p className="leading-relaxed break-words whitespace-pre-wrap italic">
                  <Ecrit champ={`courrier.${rang}.texte`} texte={lettre.texte} />
                </p>
                <footer className="mt-1 text-right text-sm text-muted-foreground">
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
