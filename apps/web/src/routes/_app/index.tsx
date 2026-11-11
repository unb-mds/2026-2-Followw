import { noop, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState } from 'react';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/HeaderBar';
import { usePageState } from '#/components/PageState';
import { WeekDayPicker } from '#/components/WeekDayPicker';
import { nowInBrasilia, weekDays } from '#/lib/schedule';
import { publicPageHead } from '#/lib/seo';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { menuQueryOptions } from '#/queries/restaurant';

const TodayDashboard = lazy(() => import('#/components/home/TodayDashboard'));

const WEEKDAYS = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
];

export const Route = createFileRoute('/_app/')({
    head: () => ({
        ...publicPageHead({
            path: '/',
            title: 'Followw UnB — SIGAA, cardápio do RU e busca',
            description:
                'App independente para estudantes da UnB. Consulte o cardápio do RU e busque disciplinas, cursos e docentes. Entre com o SIGAA para ver suas turmas e horários.'
        }),
        scripts: [
            {
                type: 'application/ld+json',
                children: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'WebSite',
                    name: 'Followw UnB',
                    alternateName: 'Followw',
                    url: 'https://followw.app/'
                })
            }
        ]
    }),
    loader: async ({ context: { queryClient } }) => {
        const now = nowInBrasilia();
        const user = await loadQuery(queryClient, meQueryOptions);
        await Promise.all([
            loadQuery(queryClient, menuQueryOptions({ date: now.date, user })).catch(noop),
            user &&
                import('#/queries/classrooms').then(({ classroomsQueryOptions }) =>
                    loadQuery(queryClient, classroomsQueryOptions).catch(noop)
                )
        ]);
        return { now };
    },
    staticData: { header: HomeHeader },
    errorComponent: ErrorState,
    component: HomePage
});

function useNow() {
    // sem loaderData quando a rota falha, e o header ainda renderiza
    const loaded = Route.useLoaderData({ select: (data) => data?.now });
    const [now, setNow] = useState(() => loaded ?? nowInBrasilia());
    useEffect(() => {
        const id = setInterval(() => setNow(nowInBrasilia()), 30_000);
        return () => clearInterval(id);
    }, []);
    return now;
}

const useWeekOpen = () => usePageState('week', false);

function useSelectedDay() {
    const now = useNow();
    const [picked, setPicked] = usePageState('date', null);
    const days = weekDays(now.date);
    const selectedDay = days.find((day) => day.date === picked) ?? now;
    const isToday = selectedDay.date === now.date;
    const label = isToday ? 'Hoje' : WEEKDAYS[selectedDay.weekday];
    return { now, days, selectedDay, isToday, label, setPicked };
}

function HomeHeader() {
    const { label } = useSelectedDay();
    const [weekOpen, setWeekOpen] = useWeekOpen();

    return (
        <HeaderBar>
            <HeaderToggle
                open={weekOpen}
                onToggle={() => setWeekOpen(!weekOpen)}
                title={weekOpen ? 'Ocultar seletor de dias' : 'Exibir dias da semana'}
            >
                {label}
            </HeaderToggle>
        </HeaderBar>
    );
}

function HomePage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { now, days, selectedDay, isToday, label, setPicked } = useSelectedDay();
    const [weekOpen] = useWeekOpen();

    return (
        <>
            {weekOpen && (
                <WeekDayPicker
                    days={days}
                    selectedDate={selectedDay.date}
                    onSelect={(day) => setPicked(day.date === now.date ? null : day.date)}
                />
            )}

            <Suspense fallback={null}>
                <TodayDashboard
                    user={user}
                    day={selectedDay}
                    time={isToday ? now.time : undefined}
                    label={label}
                />
            </Suspense>
        </>
    );
}
