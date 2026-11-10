import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { policeDe } from '@/theme/ecritures';

type Props = {
  /** La police de l'écriture, telle que rangée dans la base. */
  police: string | null | undefined;
  className?: string;
  children: ReactNode;
};

/** Un texte tracé de la main d'un personnage. */
export function Main({ police, className, children }: Props) {
  const { famille, echelle } = policeDe(police);
  const style: CSSProperties = {
    fontFamily: `${famille}, cursive`,
    fontSize: `${echelle}em`,
  };
  return (
    <span className={cn('leading-snug', className)} style={style}>
      {children}
    </span>
  );
}
