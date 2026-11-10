import { cn } from '@/lib/utils';

type Props = {
  initiales: string;
  /** Le nom gravé, lu par les lecteurs d'écran. */
  nom: string;
  className?: string;
};

/** Un sceau du thème neutre : un simple cachet de cire, avec des initiales. */
export function Cachet({ initiales, nom, className }: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label={`Sceau de ${nom}`}
      className={cn('size-12 shrink-0', className)}
    >
      <circle cx="24" cy="24" r="22" fill="var(--sceau)" />
      <circle
        cx="24"
        cy="24"
        r="17.5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      <text
        x="24"
        y="24"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--primary-foreground)"
        fontFamily="var(--police-texte)"
        fontSize={initiales.length > 2 ? 13 : 17}
        letterSpacing="0.5"
      >
        {initiales}
      </text>
    </svg>
  );
}
