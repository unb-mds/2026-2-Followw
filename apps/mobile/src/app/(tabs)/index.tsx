import { getNoClassReason } from '@followw/core/calendar.ts';
import { classesOn, nowInBrasilia, weekDays } from '@followw/core/lib/schedule.ts';
import { classroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { latestNewsQueryOptions } from '@followw/core/queries/posts.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { campusOf, menuQueryOptions } from '@followw/core/queries/restaurant.ts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { HeaderBar, HeaderToggle } from '@/components/HeaderBar';
import { LatestNewsSection } from '@/components/home/LatestNewsSection';
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
    const classroomsQuery = useQuery({ ...classroomsQueryOptions, enabled: Boolean(user) });
    const menuOptions = menuQueryOptions({ date: selectedDay.date, user });
    const menu = useQuery(menuOptions);

    const noClassReason = getNoClassReason(selectedDay.date);
    const classes = noClassReason
        ? []
        : classesOn(
              classroomsQuery.data ?? [],
              selectedDay.weekday,
              isToday ? now.time : undefined
          );

    return (
        <Screen
            header={
                <HeaderBar>
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
                    refreshQuery(queryClient, menuOptions),
                    user && refreshQuery(queryClient, classroomsQueryOptions),
                    user && refreshQuery(queryClient, latestNewsQueryOptions)
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
                    noClassReason={noClassReason}
                    isLoadingError={classroomsQuery.isLoadingError}
                    onRetry={() => void classroomsQuery.refetch()}
                    classes={classes}
                />
                <PublicInfoSection
                    campus={campusOf(user?.unit?.code)}
                    menu={menu.data?.[0]}
                    isLoading={menu.isPending}
                    day={label}
                />
                {user && <LatestNewsSection />}
            </View>
        </Screen>
    );
}
