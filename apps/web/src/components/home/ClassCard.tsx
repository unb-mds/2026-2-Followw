import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { Award, MapIcon, MapPin } from 'lucide-react';
import { m } from 'motion/react';

import { GradeText } from '#/components/classroom/GradeText';
import { Badge } from '#/components/ui/badge';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import { Skeleton } from '#/components/ui/skeleton';
import { snappy } from '#/lib/motion';
import { cn } from '#/lib/shadcn';

export type ClassStatus = 'in_progress' | 'next' | 'pending' | 'normal' | 'warning' | 'cancelled';

interface BaseClassCardProps {
    title: string;
    compact?: boolean;
    time: string;
    /** `null` é turma sem local lançado; `undefined` omite o local. */
    location?: string | null;
    professors?: string[];
    onLocationClick?: () => void;
    indicator?: React.ReactNode;
    action?: React.ReactNode;
    /** Sem a moldura do card, para listar dentro de outro card. */
    plain?: boolean;
}

/** Aula ou turma cursada: horário e situação acima do título. */
interface LessonCardProps extends BaseClassCardProps {
    variant?: 'lesson';
    grade?: Classroom['grade'];
    status?: ClassStatus;
    statusText?: string;
    onClick?: () => void;
}

/** Turma da grade planejada: código acima do título e horário logo abaixo. */
interface PlannedCardProps extends BaseClassCardProps {
    variant: 'planned';
    code: string;
}

export type ClassCardProps = LessonCardProps | PlannedCardProps;

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

function ClassCardStatus({
    time,
    status,
    statusText
}: {
    time: string;
    status: ClassStatus;
    statusText?: string;
}) {
    const statusInfo = status === 'normal' ? undefined : STATUS[status];
    return (
        <div className="pointer-events-none relative flex items-center gap-2 text-xs">
            <span className="min-w-0 font-semibold text-primary tabular-nums">{time}</span>
            {statusInfo && (
                <Badge
                    variant={statusInfo.variant}
                    className={cn('px-1.5 py-0', statusInfo.className)}
                >
                    {status === 'in_progress' && (
                        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    )}
                    {statusText || statusInfo.label}
                </Badge>
            )}
        </div>
    );
}

function ClassCardBody({
    title,
    planned,
    compact,
    location,
    professors,
    grade,
    cancelled,
    onLocationClick,
    indicator
}: {
    title: string;
    // código e horário da turma planejada, em volta do título
    planned?: { code: string; time: string };
    compact: boolean;
    location?: string | null;
    professors?: string[];
    grade?: Classroom['grade'];
    cancelled: boolean;
    onLocationClick?: () => void;
    indicator?: React.ReactNode;
}) {
    const professorNames = professors?.join(', ');
    // A menção lançada ocupa o lugar do local.
    const place = grade || location === undefined ? undefined : (location ?? 'Local não informado');
    const details = [place, professorNames].filter(Boolean).join(' · ');

    return (
        <>
            {planned && <span className="text-xs font-semibold text-primary">{planned.code}</span>}
            <div className="pointer-events-none relative flex items-center gap-2">
                <h3
                    className={cn(
                        'min-w-0 flex-1 text-sm leading-snug font-semibold lg:line-clamp-none lg:text-lg lg:font-medium',
                        compact ? 'line-clamp-1' : 'line-clamp-2',
                        cancelled && 'text-muted-foreground line-through'
                    )}
                >
                    {title}
                </h3>
                {indicator}
            </div>
            {planned && (
                <Badge
                    variant="secondary"
                    className="pointer-events-none h-auto max-w-full min-w-0 self-start py-0 text-left whitespace-normal tabular-nums"
                >
                    {planned.time}
                </Badge>
            )}
            <div className="pointer-events-none relative flex items-center gap-1 text-xs text-muted-foreground">
                {grade ? (
                    <Award className="size-3 shrink-0" />
                ) : (
                    place && <MapPin className="size-3 shrink-0" />
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
}

export const ClassCard: React.FC<ClassCardProps> = (props) => {
    const {
        title,
        compact = false,
        time,
        location,
        professors,
        onLocationClick,
        indicator,
        action,
        plain = false
    } = props;
    const lesson = props.variant === 'planned' ? undefined : props;
    const status = lesson?.status ?? 'normal';
    const onClick = lesson?.onClick;
    const active = status === 'in_progress';
    const body = (
        <ClassCardBody
            title={title}
            planned={props.variant === 'planned' ? { code: props.code, time } : undefined}
            compact={compact}
            location={location}
            professors={professors}
            grade={lesson?.grade}
            cancelled={status === 'cancelled'}
            onLocationClick={onLocationClick}
            indicator={indicator}
        />
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
            {lesson && (
                <ClassCardStatus time={time} status={status} statusText={lesson.statusText} />
            )}
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
    const card = (
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
    if (!onClick) return card;
    return (
        <m.div whileTap={{ scale: 0.98 }} transition={snappy}>
            {card}
        </m.div>
    );
};

export function ClassCardSkeleton() {
    return (
        <Card size="sm" className="gap-2 px-3 lg:gap-3 lg:px-6 lg:py-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
        </Card>
    );
}
