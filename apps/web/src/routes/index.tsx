import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import type { Day } from '#/lib/schedule';

import { ClassCard } from '#/components/home/ClassCard';
import { LoginPromptCard } from '#/components/home/LoginPromptCard';
import { PublicInfoSection } from '#/components/home/PublicInfoSection';
import { Card } from '#/components/ui/Card';
import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { classesOn, nowInBrasilia, weekDays } from '#/lib/schedule';
import { classroomsQueryOptions } from '#/queries/classrooms';
import { meQueryOptions } from '#/queries/me';
import { menuQueryOptions } from '#/queries/restaurant';

const WEEKDAYS = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado'
];
const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const todayMenuQueryOptions = () =>
    menuQueryOptions({ campus: 'Darcy', date: nowInBrasilia().date });

export const Route = createFileRoute('/')({
    loader: async ({ context: { queryClient } }) => {
        // Aguardado para o SSR já renderizar o cardápio; sem isso a hidratação diverge.
        const [user] = await Promise.all([
            queryClient.ensureQueryData(meQueryOptions),
            queryClient.prefetchQuery(todayMenuQueryOptions())
        ]);
        if (user) await queryClient.ensureQueryData(classroomsQueryOptions);
    },
    errorComponent: ErrorState,
    component: HomePage
});

function HomePage() {
    const [now] = useState(nowInBrasilia);
    const days = weekDays(now.date);
    const [selectedDay, setSelectedDay] = useState<Day>(now);
    const [showDaysSelector, setShowDaysSelector] = useState(false);
    const isToday = selectedDay.date === now.date;

    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { data: classrooms = [] } = useQuery({
        ...classroomsQueryOptions,
        enabled: Boolean(user)
    });
    const menu = useQuery(todayMenuQueryOptions());

    const classes = classesOn(classrooms, selectedDay.weekday, isToday ? now.time : undefined);

    return (
        <>
            <HeaderBar>
                <button
                    type="button"
                    onClick={() => setShowDaysSelector(!showDaysSelector)}
                    className="group flex cursor-pointer items-center gap-1 text-left select-none focus:outline-none"
                    title={showDaysSelector ? 'Ocultar seletor de dias' : 'Exibir dias da semana'}
                >
                    <h1 className="text-3xl leading-none font-bold tracking-tight text-ink transition-colors group-hover:text-primary">
                        {isToday ? 'Hoje' : WEEKDAYS[selectedDay.weekday]}
                    </h1>
                    <span
                        className={`material-symbols-outlined text-2xl text-muted transition-transform duration-200 group-hover:text-primary ${
                            showDaysSelector ? 'rotate-180 text-primary' : ''
                        }`}
                    >
                        expand_more
                    </span>
                </button>
            </HeaderBar>

            {showDaysSelector && (
                <div className="no-scrollbar mb-5 flex items-center gap-2 overflow-x-auto py-1">
                    {days.map((item) => {
                        const isActive = item.date === selectedDay.date;
                        return (
                            <button
                                key={item.date}
                                type="button"
                                onClick={() => setSelectedDay(item)}
                                className={`flex h-16.5 w-13.5 min-w-13.5 shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl transition-all active:scale-95 ${
                                    isActive
                                        ? 'bg-primary text-white shadow-md shadow-primary/30'
                                        : 'border border-line bg-white/80 text-muted hover:bg-white'
                                }`}
                            >
                                <span
                                    className={`text-xs font-bold tracking-wider uppercase ${
                                        isActive ? 'text-white/90' : 'text-subtle'
                                    }`}
                                >
                                    {MONTHS[Number(item.date.slice(5, 7)) - 1]}
                                </span>
                                <span
                                    className={`text-lg font-extrabold ${
                                        isActive ? 'text-white' : 'text-ink'
                                    }`}
                                >
                                    {Number(item.date.slice(8))}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <SectionHeader
                title="Aulas do Dia"
                badge={
                    user
                        ? `${classes.length} ${classes.length === 1 ? 'aula' : 'aulas'}`
                        : undefined
                }
            />

            {user ? (
                <div className="flex flex-col gap-1">
                    {classes.map(({ item, start, end, status }) => (
                        <ClassCard
                            key={`${item.id}-${start}`}
                            title={item.subject.name}
                            code={item.subject.code ?? undefined}
                            time={`${start} - ${end}`}
                            location={item.room ?? 'Local não informado'}
                            status={status}
                            accentColor={status === 'in_progress' ? 'var(--color-live)' : undefined}
                        />
                    ))}
                    {classes.length === 0 && (
                        <Card className="mb-3 text-center text-sm text-muted">
                            Nenhuma aula neste dia.
                        </Card>
                    )}
                </div>
            ) : (
                <div className="mb-4">
                    <LoginPromptCard />
                </div>
            )}

            <PublicInfoSection menu={menu.data?.[0]} isLoading={menu.isPending} />
        </>
    );
}
