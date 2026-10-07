import { MapIcon, MapPin } from 'lucide-react';

import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { cn } from '#/lib/shadcn';

export interface ClassCardProps {
    title: string;
    code?: string;
    time: string;
    location?: string;
    professor?: string;
    status?: 'in_progress' | 'next' | 'normal' | 'warning';
    statusText?: string;
    onLocationClick?: () => void;
    onClick?: () => void;
}

const STATUS = {
    in_progress: {
        label: 'Em andamento',
        variant: 'default',
        className: 'bg-primary/10 text-primary'
    },
    next: { label: 'Próxima', variant: 'secondary', className: 'text-muted-foreground' },
    warning: { label: 'Atenção', variant: 'destructive', className: '' }
} as const;

export const ClassCard: React.FC<ClassCardProps> = ({
    title,
    code,
    time,
    location,
    professor,
    status = 'normal',
    statusText,
    onLocationClick,
    onClick
}) => {
    const statusInfo = status === 'normal' ? undefined : STATUS[status];
    const active = status === 'in_progress';

    return (
        <Card
            size="sm"
            className={cn('relative gap-1 px-3', active && 'bg-primary/5 ring-primary/30')}
        >
            {onClick && (
                <Button
                    variant="ghost"
                    onClick={onClick}
                    aria-label={title}
                    className="absolute inset-0 h-full w-full rounded-2xl hover:bg-primary/5"
                />
            )}
            <div className="pointer-events-none relative flex items-center gap-2 text-xs">
                <span className="min-w-0 font-semibold text-primary tabular-nums">{time}</span>
                {statusInfo && (
                    <Badge
                        variant={statusInfo.variant}
                        className={cn('h-4 px-1.5 py-0', statusInfo.className)}
                    >
                        {active && (
                            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                        )}
                        {statusText || statusInfo.label}
                    </Badge>
                )}
                {code && (
                    <span className="ml-auto shrink-0 font-medium tracking-wide text-muted-foreground">
                        {code}
                    </span>
                )}
            </div>
            <h3 className="pointer-events-none relative line-clamp-2 text-sm leading-snug font-semibold">
                {title}
            </h3>
            <div className="pointer-events-none relative flex items-center gap-2 text-xs text-muted-foreground">
                {location && <MapPin className="size-3 shrink-0" />}
                <span className="min-w-0 truncate">
                    {[location, professor].filter(Boolean).join(' · ')}
                </span>
                {onLocationClick && (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={onLocationClick}
                        className="pointer-events-auto ml-auto text-muted-foreground"
                        title="Ver mapa da sala"
                        aria-label="Ver mapa da sala"
                    >
                        <MapIcon />
                    </Button>
                )}
            </div>
        </Card>
    );
};
