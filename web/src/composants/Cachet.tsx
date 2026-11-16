import { cn } from '@/lib/utils';
import type { EtatSceau } from '@/types/EtatSceau';

type Props = {
  initiales: string;
  /** Le nom gravé, lu par les lecteurs d'écran. */
  nom: string;
  /**
   * L'état du sceau, tel que le destinataire le voit. Sans rien de remarqué, il est intact.
   * Rien ne l'explique : le dessin seul le montre.
   */
  etat?: EtatSceau;
  className?: string;
};

/** Un sceau du thème neutre : un simple cachet de cire, avec des initiales. */
export function Cachet({ initiales, nom, etat = 'intact', className }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={`Sceau de ${nom}`}
      className={cn('size-12 shrink-0', className)}
    >
      {/* Une imitation : le bord n'est pas tout à fait rond. */}
      {etat === 'contrefait' ? (
        <ellipse cx="24" cy="24" rx="22" ry="20.8" transform="rotate(-18 24 24)" fill="var(--sceau)" />
      ) : (
        <circle cx="24" cy="24" r="22" fill="var(--sceau)" />
      )}
      <circle
        cx="24"
        cy="24"
        r="17.5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeDasharray={etat === 'contrefait' ? '2.5 1.5' : undefined}
      />
      <text
        x={etat === 'contrefait' ? 24.8 : 24}
        y={etat === 'contrefait' ? 24.9 : 24}
        transform={etat === 'contrefait' ? 'rotate(-5 24 24)' : undefined}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--primary-foreground)"
        fontFamily="var(--police-texte)"
        fontSize={initiales.length > 2 ? 13 : 17}
        letterSpacing="0.5"
      >
        {initiales}
      </text>
      {(etat === 'brise' || etat === 'recolle') && (
        <path
          d="M20 2 L26 14 L21 22 L28 31 L23 46"
          fill="none"
          // Brisé : une fêlure, par où l'on voit le papier. Recollé : une ligne de cire
          // plus sombre, là où le cachet a été refermé.
          stroke={etat === 'brise' ? 'var(--background)' : 'var(--foreground)'}
          strokeOpacity={etat === 'brise' ? 1 : 0.5}
          strokeWidth={etat === 'brise' ? 2 : 1.6}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
