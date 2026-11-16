import { vocabulaire } from '@/theme/neutre';
import type { Rapport } from '@/types/Rapport';

import { Ecrit } from './encre';
import { DateEcrite, Feuille } from './Feuille';

const mots = vocabulaire.gabarits.rapport;

/**
 * Un rapport : imprimé. Son titre, le nom de celui qui rapporte, puis ses rubriques,
 * chacune sous son intertitre.
 */
export function RapportLu({
  contenu,
  date,
  className,
}: {
  contenu: Rapport;
  date: string | null;
  className?: string;
}) {
  const a = (texte: string) => texte.trim() !== '';
  return (
    <Feuille imprimee className={className}>
      <DateEcrite date={date} />
      <header className="border-b border-foreground/40 pb-3">
        <h2 className="text-2xl leading-snug font-bold break-words text-balance">
          <Ecrit champ="titre" texte={contenu.titre} />
        </h2>
        {a(contenu.auteur) && (
          <p className="mt-1 text-muted-foreground">
            {mots.par} <Ecrit champ="auteur" texte={contenu.auteur} />
          </p>
        )}
      </header>
      <div className="mt-5 grid gap-5">
        {contenu.rubriques.map((rubrique, rang) => (
          <section key={rang}>
            {a(rubrique.titre) && (
              <h3 className="mb-1 text-sm font-bold tracking-wider break-words uppercase">
                <Ecrit champ={`rubriques.${rang}.titre`} texte={rubrique.titre} />
              </h3>
            )}
            <p className="leading-relaxed break-words whitespace-pre-wrap">
              <Ecrit champ={`rubriques.${rang}.texte`} texte={rubrique.texte} />
            </p>
          </section>
        ))}
      </div>
    </Feuille>
  );
}
