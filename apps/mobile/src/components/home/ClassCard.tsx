import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { Award, MapIcon, MapPin } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GradeText } from '@/components/classroom/GradeText';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export interface ClassCardProps {
    title: string;
    compact?: boolean;
    code?: string;
    time: string;
    location?: string;
    professors?: string[];
    classNumber?: string;
    grade?: Classroom['grade'];
    status?: 'in_progress' | 'next' | 'pending' | 'normal' | 'warning';
    statusText?: string;
    onLocationClick?: () => void;
    onClick?: () => void;
    indicator?: React.ReactNode;
    action?: React.ReactNode;
}

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
    warning: { label: 'Atenção', variant: 'destructive', className: '', textClassName: '' }
} as const;

export function ClassCard({
    title,
    compact = false,
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
    indicator,
    action
}: ClassCardProps) {
    const statusInfo = status === 'normal' ? undefined : STATUS[status];
    const active = status === 'in_progress';
    const professorNames = professors?.join(', ');
    const details = [location, professorNames].filter(Boolean).join(' · ');

    const body = (
        <View className={cn('flex-col', compact && !action ? 'gap-0.5' : 'gap-1')}>
            <View className="flex-row items-center gap-2">
                <Text
                    role="heading"
                    aria-level={3}
                    numberOfLines={compact ? 1 : 2}
                    className="min-w-0 flex-1 text-sm leading-snug font-semibold"
                >
                    {title}
                </Text>
                {indicator}
            </View>
            <View className="flex-row items-center gap-1">
                {grade ? (
                    <Icon as={Award} className="size-3 shrink-0 text-muted-foreground" />
                ) : (
                    location && (
                        <Icon as={MapPin} className="size-3 shrink-0 text-muted-foreground" />
                    )
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

    return (
        <Pressable
            disabled={!onClick}
            onPress={onClick}
            accessibilityRole={onClick ? 'button' : undefined}
            accessibilityLabel={onClick ? title : undefined}
            className="active:opacity-70"
        >
            <Card
                size="sm"
                className={cn(
                    'gap-1 px-3',
                    active && 'border-primary/30 bg-primary/5',
                    compact && 'gap-0.5 py-2'
                )}
            >
                <View className="flex-row items-center gap-2">
                    <Text className="min-w-0 text-xs font-semibold text-primary">{time}</Text>
                    {statusInfo && (
                        <Badge
                            variant={statusInfo.variant}
                            className={cn('px-1.5 py-0', statusInfo.className)}
                        >
                            {active && <View className="size-1.5 rounded-full bg-primary" />}
                            <Text className={cn('text-xs', statusInfo.textClassName)}>
                                {statusText || statusInfo.label}
                            </Text>
                        </Badge>
                    )}
                    {code && (
                        <Text className="ml-auto shrink-0 text-xs font-medium tracking-wide text-muted-foreground">
                            {[code, classNumber && `T${classNumber}`].filter(Boolean).join(' · ')}
                        </Text>
                    )}
                </View>
                {action ? (
                    <View className="flex-row items-center justify-between gap-2">
                        <View className="min-w-0 flex-1">{body}</View>
                        <View className="shrink-0">{action}</View>
                    </View>
                ) : (
                    body
                )}
            </Card>
        </Pressable>
    );
}
