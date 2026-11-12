import { X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { Button } from '#/components/ui/button';
import { easeIn, snappy, spring } from '#/lib/motion';

/** Barra flutuante de ações em lote; some (animada) quando a seleção zera. */
export function SelectionBar({
    label,
    count,
    units,
    onClear,
    children
}: {
    label: string;
    count: number;
    units: [one: string, many: string];
    onClear: () => void;
    children: React.ReactNode;
}) {
    return (
        <AnimatePresence>
            {count > 0 && (
                <m.div
                    role="toolbar"
                    aria-label={label}
                    className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card/80 py-1 pr-1 pl-2 text-sm text-card-foreground shadow-lg backdrop-blur-xl"
                    initial={{ opacity: 0, y: 16, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1, transition: spring }}
                    exit={{ opacity: 0, y: 12, transition: { duration: 0.15, ease: easeIn } }}
                >
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Limpar seleção"
                        className="rounded-full"
                        onClick={onClear}
                    >
                        <X />
                    </Button>
                    <m.span
                        key={count}
                        className="pr-2 whitespace-nowrap tabular-nums"
                        initial={{ scale: 0.85, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={snappy}
                    >{`${count} ${units[count === 1 ? 0 : 1]}`}</m.span>
                    {children}
                </m.div>
            )}
        </AnimatePresence>
    );
}
