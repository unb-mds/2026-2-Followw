import { lessonsOn, nowInBrasilia, weekDays } from '@followw/core/lib/schedule.ts';
import { weekLessonsQueryOptions } from '@followw/core/queries/lessons.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { latestPostsQueryOptions } from '@followw/core/queries/posts.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import {
    campusOf,
    useMenuPreview,
    weeklyMenuQueryOptions
} from '@followw/core/queries/restaurant.ts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { BackToTodayBar } from '@/components/BackToTodayBar';
import { HeaderBar, HeaderToggle } from '@/components/HeaderBar';
import { NewsNotifications } from '@/components/home/NewsNotifications';
import { PublicInfoSection } from '@/components/home/PublicInfoSection';
import { TodayClassesSection } from '@/components/home/TodayClassesSection';
import { Screen } from '@/components/Screen';
import { WeekDayPicker } from '@/components/WeekDayPicker';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

const WEEKDAYS = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
];

function useNow() {
    const [now, setNow] = useState(() => nowInBrasilia());
    useEffect(() => {
        const id = setInterval(() => setNow(nowInBrasilia()), 30_000);
        return () => clearInterval(id);
    }, []);
    return now;
}

export default function HomeScreen() {
    const now = useNow();
    const [picked, setPicked] = useState<string | null>(null);
    const [weekOpen, setWeekOpen] = useState(false);

    const days = weekDays(now.date);
    const selectedDay = days.find((day) => day.date === picked) ?? now;
    const isToday = selectedDay.date === now.date;
    const label = isToday ? 'Hoje' : WEEKDAYS[selectedDay.weekday];

    const me = useQuery(meQueryOptions);
    const user = me.data;
    const lessons = useQuery({ ...weekLessonsQueryOptions, enabled: Boolean(user) });
    const campus = campusOf(user?.unit?.code);
    const preview = useMenuPreview({ campus, date: selectedDay.date, now });
    const selected = lessons.data?.find((item) => item.date === selectedDay.date);
    const classes = lessonsOn(
        selected?.lessons ?? [],
        selectedDay.weekday,
        isToday ? now.time : undefined
    );

    return (
        <View className="flex-1">
            <Screen
                header={
                    <HeaderBar actions={user && <NewsNotifications />}>
                        <HeaderToggle
                            open={weekOpen}
                            onToggle={() => setWeekOpen((open) => !open)}
                            title={weekOpen ? 'Ocultar seletor de dias' : 'Exibir dias da semana'}
                        >
                            {label}
                        </HeaderToggle>
                    </HeaderBar>
                }
                onRefreshData={(queryClient) =>
                    Promise.all([
                        refreshQuery(queryClient, meQueryOptions),
                        refreshQuery(
                            queryClient,
                            weeklyMenuQueryOptions({ campus, date: selectedDay.date })
                        ),
                        user && refreshQuery(queryClient, weekLessonsQueryOptions),
                        user && refreshQuery(queryClient, latestPostsQueryOptions)
                    ])
                }
            >
                {weekOpen && (
                    <WeekDayPicker
                        days={days}
                        selectedDate={selectedDay.date}
                        onSelect={(day) => setPicked(day.date === now.date ? null : day.date)}
                    />
                )}

                <View className="flex-col gap-6">
                    <TodayClassesSection
                        loggedIn={Boolean(user)}
                        noClassReason={selected?.no_class_reason ?? undefined}
                        isLoadingError={lessons.isLoadingError}
                        onRetry={() => void lessons.refetch()}
                        classes={classes}
                        date={selectedDay.date}
                        now={now}
                    />
                    <PublicInfoSection
                        campus={campus}
                        menus={preview.menus}
                        isLoading={preview.isLoading}
                        day={label}
                        date={selectedDay.date}
                        now={now}
                    />
                </View>
            </Screen>
            <BackToTodayBar open={!isToday} onBack={() => setPicked(null)} />
        </View>
    );
}
