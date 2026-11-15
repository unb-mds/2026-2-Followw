import { m } from 'motion/react';

import { spring } from '#/lib/motion';
import { cn } from '#/lib/shadcn';

/** Trecho do trace do dia que enche com o andamento da aula; vermelho se houve falta. */
export function ClassProgress({ progress, absent }: { progress: number; absent: boolean }) {
    return (
        <div aria-hidden="true" className="flex w-0.5 shrink-0 bg-muted">
            <m.span
                className={cn(
                    'w-full origin-top transition-colors',
                    absent ? 'bg-destructive' : 'bg-primary'
                )}
                initial={false}
                animate={{ scaleY: progress }}
                transition={spring}
            />
        </div>
    );
}
