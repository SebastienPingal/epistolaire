import { useId } from 'react';

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
  /**
   * L'adresse de l'image du sceau, s'il en a une (`@/outils/images`). Elle remplace les
   * initiales, dans la cire. Sans elle, ou si elle ne se charge pas, les initiales restent.
   */
  image?: string | null;
  className?: string;
};

/** Un sceau du thème neutre : un cachet de cire, avec des initiales ou une image. */
export function Cachet({ initiales, nom, etat = 'intact', image, className }: Props) {
  const decoupe = useId();
  const contrefait = etat === 'contrefait';
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={`Sceau de ${nom}`}
      className={cn('size-12 shrink-0', className)}
    >
      {/* Une imitation : le bord n'est pas tout à fait rond. */}
      {contrefait ? (
        <ellipse cx="24" cy="24" rx="22" ry="20.8" transform="rotate(-18 24 24)" fill="var(--sceau)" />
      ) : (
        <circle cx="24" cy="24" r="22" fill="var(--sceau)" />
      )}
      <text
        x={contrefait ? 24.8 : 24}
        y={contrefait ? 24.9 : 24}
        transform={contrefait ? 'rotate(-5 24 24)' : undefined}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--primary-foreground)"
        fontFamily="var(--police-texte)"
        fontSize={initiales.length > 2 ? 13 : 17}
        letterSpacing="0.5"
      >
        {initiales}
      </text>
      {image && (
        <>
          <clipPath id={decoupe}>
            <circle cx="24" cy="24" r="17.5" />
          </clipPath>
          {/* L'image est gravée dans la cire : elle tient dans le filet, un peu de travers
              si le sceau est une imitation. */}
          <image
            href={image}
            x="6.5"
            y="6.5"
            width="35"
            height="35"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${decoupe})`}
            transform={contrefait ? 'rotate(-5 24 24) translate(0.8 0.9)' : undefined}
          />
        </>
      )}
      <circle
        cx="24"
        cy="24"
        r="17.5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.45"
        strokeWidth="1"
        strokeDasharray={contrefait ? '2.5 1.5' : undefined}
      />
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
