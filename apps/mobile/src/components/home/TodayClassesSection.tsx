import type { Day, ScheduledClass } from '@followw/core/lib/schedule.ts';
import type { WeekLesson } from '@followw/core/queries/lessons.ts';

import { dayTimeline } from '@followw/core/lib/day-timeline.ts';
import { formatDuration, nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { View } from 'react-native';

import { ErrorCard, SIGAA_DOWN_MESSAGE } from '@/components/ErrorState';
import { ClassProgress } from '@/components/home/ClassProgress';
import { LessonCard } from '@/components/home/LessonCard';
import { LoginPromptCard } from '@/components/home/LoginPromptCard';
import { SectionHeader } from '@/components/SectionHeader';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface TodayClassesSectionProps {
    loggedIn: boolean;
    noClassReason?: string;
    isLoadingError: boolean;
    onRetry: () => void;
    classes: ScheduledClass<WeekLesson>[];
    date?: string;
    now?: Day & { time: string };
}

export function TodayClassesSection(props: TodayClassesSectionProps) {
    const { loggedIn, noClassReason, isLoadingError, classes } = props;
    // sem aulas no dia, a seção some
    if (loggedIn && !noClassReason && !isLoadingError && !classes.length) return null;

    return (
        <View>
            <SectionHeader title="Aulas do dia" />
            <TodayClassesContent {...props} />
        </View>
    );
}

const cancelled = (lesson: WeekLesson) => lesson.status === 'cancelada';

function TodayClassesContent({
    loggedIn,
    noClassReason,
    isLoadingError,
    onRetry,
    classes,
    date,
    now = nowInBrasilia()
}: TodayClassesSectionProps) {
    const router = useRouter();

    if (!loggedIn) return <LoginPromptCard />;
    if (noClassReason)
        return (
            <View className="rounded-2xl bg-card p-4">
                <Text className="font-semibold">Não há aulas hoje</Text>
                <Text className="text-sm text-muted-foreground">{noClassReason}</Text>
            </View>
        );
    if (isLoadingError) return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={onRetry} />;

    const timeline = dayTimeline(classes, date ?? now.date, now);
    return (
        <View className="relative">
            {/* o fundo do card começa depois do trace, que fica fora dele */}
            <Card size="sm" className="absolute inset-y-0 right-0 left-3.5 py-0" />
            {timeline.map(({ item, start, end, status, progress, gap, overlap }, index) => (
                <Fragment key={item.id}>
                    {index > 0 && (
                        <View className="flex-row gap-3">
                            <ClassProgress progress={progress > 0 ? 1 : 0} absent={false} />
                            <View className="min-w-0 flex-1 flex-row pr-3 pl-4">
                                <Divider gap={gap} overlap={overlap} />
                            </View>
                        </View>
                    )}
                    <View className="flex-row gap-3">
                        <ClassProgress
                            progress={cancelled(item) ? 0 : progress}
                            absent={item.status === 'falta'}
                        />
                        <View
                            className={cn(
                                'min-w-0 flex-1 overflow-hidden',
                                index === 0 && 'rounded-t-2xl',
                                index === timeline.length - 1 && 'rounded-b-2xl'
                            )}
                        >
                            <LessonCard
                                lesson={item}
                                start={start}
                                end={end}
                                status={status}
                                onClick={() =>
                                    router.push({
                                        pathname: '/turmas/[id]',
                                        params: { id: item.classroom.id }
                                    })
                                }
                            />
                        </View>
                    </View>
                </Fragment>
            ))}
        </View>
    );
}

/** Entre duas aulas: o intervalo, a sobreposição ou só a linha. */
function Divider({ gap, overlap }: { gap: number; overlap: boolean }) {
    const label = overlap
        ? 'Horários sobrepostos'
        : gap > 0
          ? `Intervalo de ${formatDuration(gap)}`
          : null;
    if (!label) return <View className="my-auto h-px flex-1 bg-border" />;
    return (
        <View className="flex-1 flex-row items-center gap-3 py-1">
            <View className="h-px flex-1 bg-border" />
            <Text className={cn('text-xs', overlap ? 'text-warning' : 'text-muted-foreground')}>
                {label}
            </Text>
            <View className="h-px flex-1 bg-border" />
        </View>
    );
}
