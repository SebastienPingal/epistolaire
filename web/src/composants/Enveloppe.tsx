import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { Gabarit } from '@/types/Gabarit';

/**
 * La forme d'un pli vu de l'extérieur. Elle laisse deviner la sorte de document
 * (décision du MJ) : une carte arrive en rouleau, une gazette en journal plié, et tout le
 * reste en pli ordinaire. Rien d'autre ne se devine avant l'ouverture.
 */
export type Forme = 'pli' | 'rouleau' | 'journal';

export const formeDe = (gabarit: Gabarit | undefined): Forme =>
  gabarit === 'carte' ? 'rouleau' : gabarit === 'gazette' ? 'journal' : 'pli';

type Props = {
  /** Un pli ouvert montre son rabat relevé, son lien défait ou sa bande ôtée. */
  ouverte?: boolean;
  forme?: Forme;
  className?: string;
  /** Ce qui se pose au milieu : le cachet, ou la pliure. */
  children?: ReactNode;
};

const TRAIT = {
  fill: 'none',
  stroke: 'var(--border)',
  strokeWidth: 1,
  vectorEffect: 'non-scaling-stroke',
} as const;

/** Un pli vu de l'extérieur : une feuille pliée, un rouleau, ou un journal. */
export function Enveloppe({ ouverte = false, forme = 'pli', className, children }: Props) {
  return (
    <div
      data-forme={forme}
      className={cn(
        'relative aspect-[3/2]',
        forme !== 'rouleau' && 'rounded-sm bg-card shadow-sm ring-1 ring-foreground/10',
        className,
      )}
    >
      <svg
        viewBox="0 0 150 100"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 size-full"
      >
        {forme === 'pli' &&
          (ouverte ? (
            <path d="M2 2 L75 34 L148 2" {...TRAIT} strokeDasharray="3 3" />
          ) : (
            <path d="M2 2 L75 56 L148 2" {...TRAIT} fill="var(--muted)" fillOpacity="0.55" />
          ))}

        {forme === 'rouleau' && (
          <>
            {/* Le rouleau, couché : la feuille enroulée, et ses deux bouts. */}
            <rect x="8" y="30" width="134" height="40" rx="4" {...TRAIT} fill="var(--card)" />
            <ellipse cx="10" cy="50" rx="6" ry="20" {...TRAIT} fill="var(--muted)" />
            <ellipse cx="140" cy="50" rx="6" ry="20" {...TRAIT} fill="var(--muted)" />
            <path d="M22 38 H128 M22 62 H128" {...TRAIT} strokeOpacity="0.6" />
            {/* Le lien qui le tient fermé : défait, il pend de côté. */}
            {ouverte ? (
              <path d="M70 70 Q66 84 58 90 M80 70 Q86 82 94 88" {...TRAIT} stroke="var(--sceau)" />
            ) : (
              <rect x="68" y="29" width="14" height="42" fill="var(--sceau)" fillOpacity="0.75" />
            )}
          </>
        )}

        {forme === 'journal' && (
          <>
            {/* Le journal plié : son titre, ses colonnes, et la pliure au milieu. */}
            <rect x="12" y="10" width="126" height="9" fill="var(--foreground)" fillOpacity="0.55" />
            <path d="M12 24 H138" {...TRAIT} stroke="var(--foreground)" strokeOpacity="0.4" />
            <path
              d="M12 32 H70 M12 39 H70 M12 46 H62 M80 32 H138 M80 39 H138 M80 46 H128 M12 68 H70 M12 75 H66 M12 82 H70 M80 68 H138 M80 75 H138 M80 82 H120"
              {...TRAIT}
              stroke="var(--muted-foreground)"
              strokeOpacity="0.45"
            />
            <path d="M2 57 H148" {...TRAIT} strokeDasharray={ouverte ? '3 3' : undefined} />
            {/* La bande qui le tient fermé. */}
            {!ouverte && (
              <rect x="56" y="1" width="38" height="98" {...TRAIT} fill="var(--muted)" fillOpacity="0.9" />
            )}
          </>
        )}
      </svg>
      {children && (
        <div
          className={cn(
            'absolute inset-x-0 flex -translate-y-1/2 justify-center',
            forme === 'pli' ? 'top-[56%]' : 'top-1/2',
          )}
        >
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
