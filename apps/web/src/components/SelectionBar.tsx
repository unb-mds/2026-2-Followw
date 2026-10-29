import { X } from 'lucide-react';

import { Button } from '#/components/ui/button';

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
        <div
            role="toolbar"
            aria-label={label}
            className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 animate-in items-center gap-1 rounded-full border bg-card/80 py-1 pr-1 pl-2 text-sm text-card-foreground shadow-lg backdrop-blur-xl fade-in-0 slide-in-from-bottom-2"
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
            <span className="pr-2 whitespace-nowrap tabular-nums">{`${count} ${units[count === 1 ? 0 : 1]}`}</span>
            {children}
        </div>
    );
}
