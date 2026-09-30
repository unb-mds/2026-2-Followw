import { noop, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { usePageState } from '#/components/PageState';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ui/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/ui/HeaderBar';
import { PullToRefresh } from '#/components/ui/PullToRefresh';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { WeekDayPicker } from '#/components/ui/WeekDayPicker';
import { classesOn, nowInBrasilia, weekDays } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';
import { campusOf, menuQueryOptions } from '#/queries/restaurant';

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
    loader: async ({ context: { queryClient } }) => {
        const now = nowInBrasilia();
        const user = await queryClient.query(meQueryOptions);
        await Promise.all([
            queryClient.query(menuQueryOptions({ date: now.date, user })).catch(noop),
            user && queryClient.query(classroomsQueryOptions).catch(noop)
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
    return { now, days, selectedDay, isToday, setPicked };
}

function HomeHeader() {
    const { selectedDay, isToday } = useSelectedDay();
    const [weekOpen, setWeekOpen] = useWeekOpen();

    return (
        <HeaderBar>
            <HeaderToggle
                open={weekOpen}
                onToggle={() => setWeekOpen(!weekOpen)}
                title={weekOpen ? 'Ocultar seletor de dias' : 'Exibir dias da semana'}
            >
                {isToday ? 'Hoje' : WEEKDAYS[selectedDay.weekday]}
            </HeaderToggle>
        </HeaderBar>
    );
}

function HomePage() {
    const navigate = useNavigate();
    const { now, days, selectedDay, isToday, setPicked } = useSelectedDay();
    const [weekOpen] = useWeekOpen();

    const queryClient = useQueryClient();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const classroomsQuery = useQuery({
        ...classroomsQueryOptions,
        enabled: Boolean(user)
    });
    const classrooms = classroomsQuery.data ?? [];
    const menuQuery = menuQueryOptions({ date: now.date, user });
    const menu = useQuery(menuQuery);

    const refresh = () =>
        Promise.all([
            user && refreshQuery(queryClient, classroomsQueryOptions),
            refreshQuery(queryClient, menuQuery)
        ]);

    const classes = classesOn(classrooms, selectedDay.weekday, isToday ? now.time : undefined);

    return (
        <PullToRefresh onRefresh={refresh}>
            {weekOpen && (
                <WeekDayPicker
                    days={days}
                    selectedDate={selectedDay.date}
                    onSelect={(day) => setPicked(day.date === now.date ? null : day.date)}
                />
            )}

            {user ? (
                classroomsQuery.isError ? (
                    <section>
                        <SectionHeader title="Aulas do dia" />
                        <ErrorCard
                            message={SIGAA_DOWN_MESSAGE}
                            onRetry={() => classroomsQuery.refetch()}
                        />
                    </section>
                ) : (
                    classes.length > 0 && (
                        <section>
                            <SectionHeader
                                title="Aulas do dia"
                                badge={`${classes.length} ${classes.length === 1 ? 'aula' : 'aulas'}`}
                            />
                            <div className="flex flex-col gap-2">
                                {classes.map(({ item, start, end, status }) => (
                                    <ClassCard
                                        key={`${item.id}-${start}`}
                                        title={item.subject.name}
                                        code={item.subject.code ?? undefined}
                                        time={`${start} - ${end}`}
                                        location={item.room ?? 'Local não informado'}
                                        status={status}
                                        accentColor={
                                            status === 'in_progress'
                                                ? 'var(--color-live)'
                                                : undefined
                                        }
                                        onClick={() =>
                                            navigate({ to: '/turmas/$id', params: { id: item.id } })
                                        }
                                    />
                                ))}
                            </div>
                        </section>
                    )
                )
            ) : (
                <section>
                    <SectionHeader title="Aulas do dia" />
                    <div className="mb-4">
                        <LoginPromptCard />
                    </div>
                </section>
            )}

            <PublicInfoSection
                campus={campusOf(user?.unity)}
                menu={menu.data?.[0]}
                isLoading={menu.isPending}
            />
        </PullToRefresh>
    );
}
