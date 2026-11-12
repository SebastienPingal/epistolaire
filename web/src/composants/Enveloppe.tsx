import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Props = {
  /** Un pli ouvert montre son rabat relevé. */
  ouverte?: boolean;
  className?: string;
  /** Ce qui se pose au milieu, à la pointe du rabat : le cachet, ou la pliure. */
  children?: ReactNode;
};

/** Un pli vu de l'extérieur : une feuille pliée, et son rabat. */
export function Enveloppe({ ouverte = false, className, children }: Props) {
  return (
    <div
      className={cn(
        'relative aspect-[3/2] rounded-sm bg-card shadow-sm ring-1 ring-foreground/10',
        className,
      )}
    >
      <svg
        viewBox="0 0 150 100"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 size-full"
      >
        {ouverte ? (
          <path
            d="M2 2 L75 34 L148 2"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <path
            d="M2 2 L75 56 L148 2"
            fill="var(--muted)"
            fillOpacity="0.55"
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {children && (
        <div className="absolute inset-x-0 top-[56%] flex -translate-y-1/2 justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/** La pliure d'un pli sans sceau : un simple repère de papier, là où serait le cachet. */
export function Pliure({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block size-12 shrink-0 rounded-full bg-secondary ring-1 ring-foreground/15',
        className,
      )}
    />
  );
}
