import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

import { getNoClassReason } from '#/calendar';
import { useDesktop } from '#/components/DesktopContext';
import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/HeaderBar';
import { DayClock } from '#/components/home/DayClock';
import { LatestNewsSection } from '#/components/home/LatestNewsSection';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { TodayClassesSection } from '#/components/home/TodayClassesSection';
import { usePageState } from '#/components/PageState';
import { WeekDayPicker } from '#/components/WeekDayPicker';
import { useBrasiliaClock } from '#/lib/clock';
import { classesOn, nowInBrasilia, weekDays } from '#/lib/schedule';
import { publicPageHead } from '#/lib/seo';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { campusOf, useMenuPreview, weeklyMenuQueryOptions } from '#/queries/restaurant';

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
            title: 'Followw — SIGAA UnB e cardápio do RU',
            description:
                'Acompanhe suas turmas, horários e postagens do SIGAA, consulte o cardápio do RU e muito mais.'
        }),
        scripts: [
            {
                type: 'application/ld+json',
                children: JSON.stringify({
                    '@context': 'https://schema.org',
                    '@type': 'WebSite',
                    name: 'Followw',
                    alternateName: 'Followw UnB',
                    url: 'https://followw.app/'
                })
            }
        ]
    }),
    loader: async ({ context: { queryClient } }) => {
        const now = nowInBrasilia();
        const user = await loadQuery(queryClient, meQueryOptions);
        await Promise.all([
            loadQuery(queryClient, weeklyMenuQueryOptions({ date: now.date, user })).catch(noop),
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
    return useBrasiliaClock(loaded);
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
    const { label, now, selectedDay } = useSelectedDay();
    const [weekOpen, setWeekOpen] = useWeekOpen();

    return (
        <HeaderBar actions={<DayClock time={now.time} />}>
            <div className="flex flex-col gap-3">
                <HeaderToggle
                    open={weekOpen}
                    onToggle={() => setWeekOpen(!weekOpen)}
                    title={weekOpen ? 'Ocultar seletor de dias' : 'Exibir dias da semana'}
                >
                    {label}
                </HeaderToggle>
                <p className="hidden text-sm text-muted-foreground desktop:block">
                    {new Intl.DateTimeFormat('pt-BR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC'
                    }).format(new Date(`${selectedDay.date}T00:00:00Z`))}
                </p>
            </div>
        </HeaderBar>
    );
}

function HomePage() {
    const desktop = useDesktop();
    const { now, days, selectedDay, isToday, label, setPicked } = useSelectedDay();
    const [weekOpen] = useWeekOpen();

    const { data: user } = useSuspenseQuery(meQueryOptions);
    const classroomsQuery = useQuery({
        ...classroomsQueryOptions,
        enabled: Boolean(user)
    });
    const classrooms = classroomsQuery.data ?? [];
    const campus = campusOf(user?.unit?.code);
    const preview = useMenuPreview({
        campus,
        date: selectedDay.date,
        now,
        upcoming: desktop
    });

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

            <div className="home-columns flex flex-col gap-6 desktop:grid desktop:items-start desktop:gap-10">
                <TodayClassesSection
                    loggedIn={Boolean(user)}
                    noClassReason={noClassReason}
                    isLoadingError={classroomsQuery.isLoadingError}
                    onRetry={() => void classroomsQuery.refetch()}
                    classes={classes}
                    date={selectedDay.date}
                    now={now}
                />
                <aside className="flex min-w-0 flex-col gap-6 desktop:gap-8 desktop:border-l desktop:pl-8">
                    <PublicInfoSection
                        campus={campus}
                        menus={preview.menus}
                        isLoading={preview.isLoading}
                        day={label}
                        date={selectedDay.date}
                        now={now}
                    />
                    {user && <LatestNewsSection />}
                </aside>
            </div>
        </>
    );
}
