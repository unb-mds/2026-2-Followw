import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { getNoClassReason } from '#/calendar';
import { ErrorCard, ErrorState, SIGAA_DOWN_MESSAGE } from '#/components/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/HeaderBar';
import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { usePageState } from '#/components/PageState';
import { SectionHeader } from '#/components/SectionHeader';
import { WeekDayPicker } from '#/components/WeekDayPicker';
import { classesOn, nowInBrasilia, weekDays } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
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
        const user = await loadQuery(queryClient, meQueryOptions);
        await Promise.all([
            loadQuery(queryClient, menuQueryOptions({ date: now.date, user })).catch(noop),
            user && loadQuery(queryClient, classroomsQueryOptions).catch(noop)
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
    const navigate = useNavigate();
    const { now, days, selectedDay, isToday, label, setPicked } = useSelectedDay();
    const [weekOpen] = useWeekOpen();

    const { data: user } = useSuspenseQuery(meQueryOptions);
    const classroomsQuery = useQuery({
        ...classroomsQueryOptions,
        enabled: Boolean(user)
    });
    const classrooms = classroomsQuery.data ?? [];
    const menu = useQuery(menuQueryOptions({ date: selectedDay.date, user }));

    const noClassReason = getNoClassReason(selectedDay.date);
    const classes = noClassReason
        ? []
        : classesOn(classrooms, selectedDay.weekday, isToday ? now.time : undefined);

    return (
        <>
            {weekOpen && (
                <WeekDayPicker
                    days={days}
                    selectedDate={selectedDay.date}
                    onSelect={(day) => setPicked(day.date === now.date ? null : day.date)}
                />
            )}

            {noClassReason ? (
                <section>
                    <SectionHeader title="Aulas do dia" />
                    <div className="rounded-2xl border bg-card p-4">
                        <p className="font-semibold">Não há aulas hoje</p>
                        <p className="text-sm text-muted-foreground">{noClassReason}</p>
                    </div>
                </section>
            ) : user ? (
                classroomsQuery.isLoadingError ? (
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
                            <SectionHeader title="Aulas do dia" />
                            <div className="flex flex-col gap-2">
                                {classes.map(({ item, start, end, status }) => (
                                    <ClassCard
                                        key={`${item.id}-${start}`}
                                        title={item.subject.name}
                                        code={item.subject.code ?? undefined}
                                        time={`${start} - ${end}`}
                                        location={item.room ?? 'Local não informado'}
                                        status={status}
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
                day={label}
            />
        </>
    );
}
