import { Award, MapIcon, MapPin } from 'lucide-react';

import type { Classroom } from '#/queries/classrooms';

import { GradeText } from '#/components/classroom/GradeText';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { cn } from '#/lib/shadcn';

export interface ClassCardProps {
    title: string;
    variant?: 'card' | 'row';
    code?: string;
    time: string;
    location?: string;
    professors?: string[];
    classNumber?: string;
    grade?: Classroom['grade'];
    status?: 'in_progress' | 'next' | 'normal' | 'warning';
    statusText?: string;
    onLocationClick?: () => void;
    onClick?: () => void;
    buttonRender?: React.ReactElement;
    indicator?: React.ReactNode;
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
    variant = 'card',
    code,
    time,
    location,
    professors,
    classNumber,
    grade,
    status = 'normal',
    statusText,
    onLocationClick,
    onClick,
    buttonRender,
    indicator
}) => {
    const statusInfo = status === 'normal' ? undefined : STATUS[status];
    const active = status === 'in_progress';
    const professorNames = professors?.join(', ');
    const details = [location, professorNames].filter(Boolean).join(' · ');

    return (
        <Card
            size="sm"
            className={cn(
                'relative gap-1 px-3',
                active && 'bg-primary/5 ring-primary/30',
                variant === 'row' && 'rounded-none bg-transparent shadow-none ring-0'
            )}
        >
            {(onClick || buttonRender) && (
                <Button
                    variant="ghost"
                    onClick={onClick}
                    render={buttonRender}
                    aria-label={title}
                    className={cn(
                        'absolute inset-0 h-full w-full rounded-2xl hover:bg-primary/5',
                        variant === 'row' && 'rounded-none focus-visible:ring-inset'
                    )}
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
                        {[code, classNumber && `T${classNumber}`].filter(Boolean).join(' · ')}
                    </span>
                )}
            </div>
            <div className="pointer-events-none relative flex items-center gap-2">
                <h3 className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug font-semibold">
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
        </Card>
    );
};
