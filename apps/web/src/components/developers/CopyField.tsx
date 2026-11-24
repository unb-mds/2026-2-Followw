import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

export function CopyField({
    label,
    value,
    wrap = false,
    className
}: {
    label: string;
    value: string;
    wrap?: boolean;
    className?: string;
}) {
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    }

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5">
                <code className={cn('flex-1 text-xs', wrap ? 'break-all' : 'truncate')}>
                    {value}
                </code>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void copy()}
                >
                    {copied ? (
                        <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                        <Copy className="size-3.5" aria-hidden="true" />
                    )}
                    {copied ? 'Copiado' : 'Copiar'}
                </Button>
            </div>
        </div>
    );
}
