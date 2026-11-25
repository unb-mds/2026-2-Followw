import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { Award, MapIcon, MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GradeText } from '@/components/classroom/GradeText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

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
    // sem a moldura do card, para listar dentro de outro card
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
        className: 'bg-primary/10',
        textClassName: 'text-primary'
    },
    next: {
        label: 'Próxima',
        variant: 'secondary',
        className: '',
        textClassName: 'text-muted-foreground'
    },
    pending: {
        label: 'Em processamento',
        variant: 'secondary',
        className: 'bg-warning/10',
        textClassName: 'text-warning'
    },
    warning: { label: 'Atenção', variant: 'destructive', className: '', textClassName: '' },
    cancelled: {
        label: 'Cancelada',
        variant: 'secondary',
        className: '',
        textClassName: 'text-muted-foreground'
    }
} as const;

export function ClassCard(props: ClassCardProps) {
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
    const planned = props.variant === 'planned' ? props.code : undefined;
    const grade = lesson?.grade;
    const status = lesson?.status ?? 'normal';
    const onClick = lesson?.onClick;
    const statusInfo = status === 'normal' ? undefined : STATUS[status];
    const active = status === 'in_progress';
    const professorNames = professors?.join(', ');
    // A menção lançada ocupa o lugar do local.
    const place = grade || location === undefined ? undefined : (location ?? 'Local não informado');
    const details = [place, professorNames].filter(Boolean).join(' · ');

    const body = (
        <View className={cn('flex-col', compact && !action ? 'gap-0.5' : 'gap-1')}>
            {planned && <Text className="text-xs font-semibold text-primary">{planned}</Text>}
            <View className="flex-row items-center gap-2">
                <Text
                    role="heading"
                    aria-level={3}
                    numberOfLines={compact ? 1 : 2}
                    className={cn(
                        'min-w-0 flex-1 text-sm leading-snug font-semibold',
                        status === 'cancelled' && 'text-muted-foreground line-through'
                    )}
                >
                    {title}
                </Text>
                {indicator}
            </View>
            {planned && (
                <Badge variant="secondary" className="max-w-full self-start py-0">
                    <Text className="text-xs">{time}</Text>
                </Badge>
            )}
            <View className="flex-row items-center gap-1">
                {grade ? (
                    <Icon as={Award} className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                    place && <Icon as={MapPin} className="size-3 shrink-0 text-muted-foreground" />
                )}
                <Text numberOfLines={1} className="min-w-0 shrink text-xs text-muted-foreground">
                    {grade && <GradeText grade={grade} className="text-xs" />}
                    {grade && details ? ' · ' : ''}
                    {details}
                </Text>
                {onLocationClick && (
                    <Button
                        variant="ghost"
                        size="icon-xs"
                        onPress={onLocationClick}
                        className="ml-auto"
                        aria-label="Ver mapa da sala"
                    >
                        <Icon as={MapIcon} className="size-3 text-muted-foreground" />
                    </Button>
                )}
            </View>
        </View>
    );

    const content = (
        <>
            {lesson && (
                <View className="flex-row items-center gap-2">
                    <Text className="min-w-0 text-xs font-semibold text-primary">{time}</Text>
                    {statusInfo && (
                        <Badge
                            variant={statusInfo.variant}
                            className={cn('px-1.5 py-0', statusInfo.className)}
                        >
                            {active && <View className="size-1.5 rounded-full bg-primary" />}
                            <Text className={cn('text-xs', statusInfo.textClassName)}>
                                {lesson?.statusText || statusInfo.label}
                            </Text>
                        </Badge>
                    )}
                </View>
            )}
            {action ? (
                <View className="flex-row items-center justify-between gap-2">
                    <View className="min-w-0 flex-1">{body}</View>
                    <View className="shrink-0">{action}</View>
                </View>
            ) : (
                body
            )}
        </>
    );

    return (
        <Pressable
            disabled={!onClick}
            onPress={onClick}
            accessibilityRole={onClick ? 'button' : undefined}
            accessibilityLabel={onClick ? title : undefined}
            className={plain ? 'active:bg-primary/5' : 'active:opacity-70'}
        >
            {plain ? (
                <View className="gap-1 py-3 pr-3 pl-4">{content}</View>
            ) : (
                <Card
                    size="sm"
                    className={cn(
                        'gap-1 px-3',
                        active && 'border-primary/30 bg-primary/5',
                        compact && 'gap-0.5 py-2'
                    )}
                >
                    {content}
                </Card>
            )}
        </Pressable>
    );
}

export function ClassCardSkeleton() {
    return (
        <Card size="sm" className="gap-2 px-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
        </Card>
    );
}
