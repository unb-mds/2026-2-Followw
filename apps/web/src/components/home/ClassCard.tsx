import { Award, MapIcon, MapPin } from 'lucide-react';

import type { Classroom } from '#/queries/classrooms';

import { GradeText } from '#/components/classroom/GradeText';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { cn } from '#/lib/shadcn';

export interface ClassCardProps {
    title: string;
    compact?: boolean;
    time: string;
    location?: string;
    professors?: string[];
    grade?: Classroom['grade'];
    status?: 'in_progress' | 'next' | 'pending' | 'normal' | 'warning' | 'cancelled';
    statusText?: string;
    onLocationClick?: () => void;
    onClick?: () => void;
    indicator?: React.ReactNode;
    action?: React.ReactNode;
    /** Sem a moldura do card, para listar dentro de outro card. */
    plain?: boolean;
}

const STATUS = {
    in_progress: {
        label: 'Em andamento',
        variant: 'default',
        className: 'bg-primary/10 text-primary'
    },
    next: { label: 'Próxima', variant: 'secondary', className: 'text-muted-foreground' },
    pending: {
        label: 'Em processamento',
        variant: 'secondary',
        className: 'bg-warning/10 text-warning'
    },
    warning: { label: 'Atenção', variant: 'destructive', className: '' },
    cancelled: { label: 'Cancelada', variant: 'secondary', className: 'text-muted-foreground' }
} as const;

export const ClassCard: React.FC<ClassCardProps> = ({
    title,
    compact = false,
    time,
    location,
    professors,
    grade,
    status = 'normal',
    statusText,
    onLocationClick,
    onClick,
    indicator,
    action,
    plain = false
}) => {
    const statusInfo = status === 'normal' ? undefined : STATUS[status];
    const active = status === 'in_progress';
    const professorNames = professors?.join(', ');
    const details = [location, professorNames].filter(Boolean).join(' · ');

    const body = (
        <>
            <div className="pointer-events-none relative flex items-center gap-2">
                <h3
                    className={cn(
                        'min-w-0 flex-1 text-sm leading-snug font-semibold lg:line-clamp-none lg:text-lg lg:font-medium',
                        compact ? 'line-clamp-1' : 'line-clamp-2',
                        status === 'cancelled' && 'text-muted-foreground line-through'
                    )}
                >
                    {title}
                </h3>
                {indicator}
            </div>
            <div className="pointer-events-none relative flex items-center gap-1 text-xs text-muted-foreground">
                {grade ? (
                    <Award className="size-3 shrink-0" />
                ) : (
                    location && <MapPin className="size-3 shrink-0" />
                )}
                <span className="min-w-0 truncate" title={professorNames ? details : undefined}>
                    {grade && <GradeText grade={grade} />}
                    {grade && details && ' · '}
                    {details}
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
        </>
    );

    const content = (
        <>
            {onClick && (
                <Button
                    variant="ghost"
                    onClick={onClick}
                    aria-label={title}
                    className={cn(
                        'absolute inset-0 h-full w-full hover:bg-primary/5',
                        plain ? 'rounded-none' : 'rounded-2xl'
                    )}
                />
            )}
            <div className="pointer-events-none relative flex items-center gap-2 text-xs">
                <span className="min-w-0 font-semibold text-primary tabular-nums">{time}</span>
                {statusInfo && (
                    <Badge
                        variant={statusInfo.variant}
                        className={cn('px-1.5 py-0', statusInfo.className)}
                    >
                        {active && (
                            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                        )}
                        {statusText || statusInfo.label}
                    </Badge>
                )}
            </div>
            {action ? (
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-col gap-1">{body}</div>
                    <div className="relative shrink-0">{action}</div>
                </div>
            ) : (
                body
            )}
        </>
    );

    if (plain)
        return (
            <div className="relative flex flex-col gap-1 py-3 pr-3 pl-4 lg:gap-2 lg:px-6">
                {content}
            </div>
        );
    return (
        <Card
            size="sm"
            className={cn(
                'relative gap-1 px-3 lg:gap-3 lg:px-6 lg:py-4',
                active && 'bg-primary/5 ring-primary/30',
                compact && 'gap-0.5 py-2'
            )}
        >
            {content}
        </Card>
    );
};
