import { AnimatePresence, m } from 'motion/react';

import { easeIn, spring } from '#/lib/motion';

/** Pílula flutuante acima da navegação; entra e sai animada. */
export function FloatingBar({
    open,
    label,
    children
}: {
    open: boolean;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <AnimatePresence>
            {open && (
                <m.div
                    role="toolbar"
                    aria-label={label}
                    className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card/80 p-1 text-sm text-card-foreground shadow-lg backdrop-blur-xl"
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
                    exit={{ opacity: 0, y: 12, transition: { duration: 0.15, ease: easeIn } }}
                >
                    {children}
                </m.div>
            )}
        </AnimatePresence>
    );
}
