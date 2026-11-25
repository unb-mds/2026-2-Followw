import type { SemesterCalendar } from '@followw/core/calendar.ts';
import type { ReactNode } from 'react';

import { getActiveSemester } from '@followw/core/calendar.ts';
import { formatClassroomDate } from '@followw/core/lib/classroom-details.ts';
import { formatDuration, minutesOf, parseSchedule } from '@followw/core/lib/schedule.ts';
import { semesterProgress, upcomingSemesterDates } from '@followw/core/lib/semester-dates.ts';
import {
    countsInSemester,
    isEnrolled,
    semesterClassroomsQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CalendarClock } from 'lucide-react-native';
import { View } from 'react-native';

import { StaleDataNotice } from '@/components/ErrorState';
import { LinesSkeleton, LoadingSkeleton } from '@/components/LoadingSkeleton';
import { SectionHeader } from '@/components/SectionHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';

export function SemesterSection({ today, loggedIn }: { today: string; loggedIn: boolean }) {
    const semester = getActiveSemester(today);
    if (!semester) return null;

    const { percent, status } = semesterProgress(semester, today);
    return (
        <View accessibilityLabel="Semestre">
            <SectionHeader title="Semestre" />
            <Card size="sm" className="gap-3 p-4">
                <View className="gap-1.5">
                    <View className="flex-row items-center justify-between gap-2">
                        <Text role="heading" aria-level={3} className="text-base font-medium">
                            {semester.semester}
                        </Text>
                        <Text aria-hidden className="text-base font-medium text-primary">
                            {percent}%
                        </Text>
                    </View>
                    <Progress accessibilityLabel="Progresso do período de aulas" value={percent} />
                    <Text className="text-sm text-muted-foreground">{status}</Text>
                </View>
                {loggedIn ? (
                    <StudentSemesterDetails semester={semester} today={today} />
                ) : (
                    <UpcomingDates dates={upcomingSemesterDates(today, semester.events)} />
                )}
            </Card>
        </View>
    );
}

function RetryLine({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-sm text-muted-foreground">{message}</Text>
            <Button variant="link" size="sm" onPress={onRetry}>
                <Text>Tentar novamente</Text>
            </Button>
        </View>
    );
}

function StudentSemesterDetails({
    semester,
    today
}: {
    semester: SemesterCalendar;
    today: string;
}) {
    const { data, isPending, isLoadingError, isError, refetch } = useQuery(
        semesterClassroomsQueryOptions(semester.semester)
    );
    const classrooms = (data ?? []).filter(countsInSemester);
    const activities = useQuery({
        ...latestPostsQueryOptions,
        enabled: classrooms.some(isEnrolled)
    });
    const minutes = classrooms
        .flatMap(({ schedule }) => parseSchedule(schedule))
        .reduce((total, { start, end }) => total + minutesOf(end) - minutesOf(start), 0);

    return (
        <>
            <View className="border-t border-border pt-3">
                {isPending ? (
                    <LoadingSkeleton label="Carregando turmas do semestre...">
                        <LinesSkeleton lines={['w-full', 'w-full']} />
                    </LoadingSkeleton>
                ) : isLoadingError ? (
                    <RetryLine
                        message="Não foi possível carregar as turmas."
                        onRetry={() => void refetch()}
                    />
                ) : (
                    <>
                        <View className="gap-1.5">
                            <View className="flex-row justify-between gap-2">
                                <Text className="text-base text-muted-foreground">
                                    Turmas no semestre
                                </Text>
                                <Text className="text-base font-medium">{classrooms.length}</Text>
                            </View>
                            <View className="flex-row justify-between gap-2">
                                <Text className="text-base text-muted-foreground">
                                    Carga horária semanal
                                </Text>
                                <Text className="text-base font-medium">
                                    {formatDuration(minutes, { short: true })}
                                </Text>
                            </View>
                        </View>
                        {isError && <StaleDataNotice subject="as turmas" className="mt-2" />}
                    </>
                )}
            </View>
            <UpcomingDates
                dates={upcomingSemesterDates(
                    today,
                    semester.events,
                    classrooms,
                    activities.data?.items
                )}
            >
                {activities.isLoadingError ? (
                    <RetryLine
                        message="Não foi possível carregar as avaliações."
                        onRetry={() => void activities.refetch()}
                    />
                ) : activities.isError ? (
                    <StaleDataNotice subject="as avaliações" />
                ) : null}
            </UpcomingDates>
        </>
    );
}

function UpcomingDates({
    dates,
    children
}: {
    dates: ReturnType<typeof upcomingSemesterDates>;
    children?: ReactNode;
}) {
    const router = useRouter();
    if (dates.length === 0 && !children) return null;

    return (
        <View className="gap-2 border-t border-border pt-3">
            <View className="flex-row items-center gap-1.5">
                <Icon as={CalendarClock} className="size-3.5 text-primary" />
                <Text role="heading" aria-level={3} className="text-base font-medium">
                    Próximas datas
                </Text>
            </View>
            {dates.length > 0 && (
                <View className="gap-1">
                    {dates.slice(0, 3).map(({ id, date, title, classroom }) => (
                        <View key={id} className="flex-row gap-3">
                            <Text className="w-11 shrink-0 text-sm font-medium text-primary">
                                {formatClassroomDate(date).slice(0, 5)}
                            </Text>
                            {classroom ? (
                                <Text
                                    accessibilityRole="link"
                                    className="min-w-0 flex-1 text-sm text-muted-foreground"
                                    onPress={() =>
                                        router.push({
                                            pathname: '/turmas/[id]',
                                            params: { id: classroom.id, tab: 'posts' }
                                        })
                                    }
                                >
                                    {title} · {classroom.subject.code}
                                </Text>
                            ) : (
                                <Text className="min-w-0 flex-1 text-sm text-muted-foreground">
                                    {title}
                                </Text>
                            )}
                        </View>
                    ))}
                </View>
            )}
            {children}
        </View>
    );
}
