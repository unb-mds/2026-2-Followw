import { X } from 'lucide-react';
import { m } from 'motion/react';

import { FloatingBar } from '#/components/FloatingBar';
import { Button } from '#/components/ui/button';
import { snappy } from '#/lib/motion';

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
        <FloatingBar open={count > 0} label={label}>
            <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Limpar seleção"
                className="ml-1 rounded-full"
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
        </FloatingBar>
    );
}
