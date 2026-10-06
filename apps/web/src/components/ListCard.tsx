import { Card } from '#/components/ui/card';
import { Progress } from '#/components/ui/progress';
import { cn } from '#/lib/shadcn';

export function ListCard({
    className,
    children
}: {
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <Card size="sm" className={cn('gap-0 divide-y divide-border px-3 py-0', className)}>
            {children}
        </Card>
    );
}

export function Meter({
    label,
    value,
    detail,
    className
}: {
    label: string;
    value: number;
    detail?: string;
    className?: string;
}) {
    return (
        <div className={cn('py-3', className)}>
            <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{label}</h3>
                <span className="text-sm font-semibold text-primary tabular-nums">
                    {value.toLocaleString('pt-BR')}%
                </span>
            </div>
            <Progress
                className="mt-2"
                value={Math.min(100, Math.max(0, value))}
                aria-label={label}
            />
            {detail && <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>}
        </div>
    );
}
