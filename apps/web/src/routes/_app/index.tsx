import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { lazy, Suspense, useEffect, useState } from 'react';

import type { UserProfile } from '#/queries/me';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/HeaderBar';
import { usePageState } from '#/components/PageState';
import { buttonVariants } from '#/components/ui/button';
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
        if (user) {
            await Promise.all([
                loadQuery(queryClient, menuQueryOptions({ date: now.date, user })).catch(noop),
                import('#/queries/classrooms').then(({ classroomsQueryOptions }) =>
                    loadQuery(queryClient, classroomsQueryOptions).catch(noop)
                )
            ]);
        }
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
    const { data: user } = useQuery(meQueryOptions);
    return user ? <TodayHeader /> : <HeaderBar />;
}

function TodayHeader() {
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
    return user ? <TodayPage user={user} /> : <VisitorHome />;
}

function VisitorHome() {
    return (
        <section className="flex flex-col items-start gap-5 rounded-2xl border bg-card px-5 py-8 sm:px-8">
            <div className="flex max-w-lg flex-col gap-3">
                <h1 className="text-4xl font-bold tracking-tight">Followw UnB</h1>
                <p className="text-lg font-semibold">Um app independente para estudantes da UnB.</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Consulte o cardápio do RU e busque disciplinas, cursos e docentes sem entrar.
                    Entre com a mesma matrícula e senha do SIGAA, sem criar outra conta, para
                    acompanhar suas turmas, horários e outros dados acadêmicos.
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Link to="/ru" className={buttonVariants({ className: 'min-h-11' })}>
                    Ver cardápio
                </Link>
                <Link
                    to="/buscar"
                    className={buttonVariants({ variant: 'secondary', className: 'min-h-11' })}
                >
                    Buscar
                </Link>
                <Link
                    to="/login"
                    className={buttonVariants({ variant: 'secondary', className: 'min-h-11' })}
                >
                    Entrar com SIGAA
                </Link>
            </div>
        </section>
    );
}

function TodayPage({ user }: { user: UserProfile }) {
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
