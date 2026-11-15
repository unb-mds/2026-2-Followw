import { m } from 'motion/react';

import { spring } from '#/lib/motion';
import { cn } from '#/lib/shadcn';

// mesmo layoutId na navbar e no campo do /buscar: a pílula se desprende e vira o campo
export function SearchPill({ className }: { className?: string }) {
    return (
        <m.span
            layoutId="desktop-search-pill"
            data-desktop-search=""
            aria-hidden="true"
            className={cn('absolute inset-0', className)}
            style={{ borderRadius: 9999 }}
            transition={spring}
        />
    );
}
