import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import type { Campus, MenuSection } from '#/queries/restaurant';

import { Card } from '#/components/ui/Card';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { nowInBrasilia } from '#/lib/schedule';
import { menuQueryOptions } from '#/queries/restaurant';

const CAMPUSES: { value: Campus; label: string }[] = [
    { value: 'Darcy', label: 'Darcy Ribeiro' },
    { value: 'Gama', label: 'Gama' },
    { value: 'Ceilandia', label: 'Ceilândia' },
    { value: 'Planaltina', label: 'Planaltina' },
    { value: 'Fazenda', label: 'Fazenda Água Limpa' }
];

const MEALS = [
    { key: 'breakfast', label: 'Café da manhã', icon: 'coffee' },
    { key: 'lunch', label: 'Almoço', icon: 'lunch_dining' },
    { key: 'dinner', label: 'Jantar', icon: 'dinner_dining' }
] as const;

export const Route = createFileRoute('/ru')({
    loader: ({ context }) =>
        context.queryClient.prefetchQuery(
            menuQueryOptions({ campus: 'Darcy', date: nowInBrasilia().date })
        ),
    component: RUPage
});

function RUPage() {
    const [campus, setCampus] = useState<Campus>('Darcy');
    const [today] = useState(() => nowInBrasilia().date);
    const { data, isPending, isError, refetch } = useQuery(
        menuQueryOptions({ campus, date: today })
    );
    const menu = data?.[0];
    const meals = MEALS.filter((meal) => menu?.[meal.key]?.length);

    return (
        <>
            <HeaderBar>
                <h1 className="text-3xl leading-none font-bold tracking-tight text-ink">
                    Cardápio
                </h1>
            </HeaderBar>

            <div className="no-scrollbar mb-5 flex items-center gap-2 overflow-x-auto py-1">
                {CAMPUSES.map((item) => (
                    <button
                        key={item.value}
                        type="button"
                        onClick={() => setCampus(item.value)}
                        className={`shrink-0 cursor-pointer rounded-full px-3.5 py-2 text-xs font-bold transition-all active:scale-95 ${
                            item.value === campus
                                ? 'bg-primary text-white shadow-md shadow-primary/30'
                                : 'border border-line bg-white/80 text-muted hover:bg-white'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            <div className="space-y-5">
                {meals.map((meal) => (
                    <div key={meal.key}>
                        <SectionHeader title={meal.label} />
                        <MealCard icon={meal.icon} sections={menu?.[meal.key] ?? []} />
                    </div>
                ))}

                {meals.length === 0 && (
                    <Card className="p-6 text-center text-sm text-muted">
                        {isPending && 'Carregando cardápio...'}
                        {isError && (
                            <>
                                O site do RU não respondeu.{' '}
                                <button
                                    type="button"
                                    onClick={() => refetch()}
                                    className="cursor-pointer font-bold text-primary-dark"
                                >
                                    Tentar novamente
                                </button>
                            </>
                        )}
                        {!isPending && !isError && 'Cardápio de hoje não publicado.'}
                    </Card>
                )}
            </div>
        </>
    );
}

function MealCard({ icon, sections }: { icon: string; sections: MenuSection[] }) {
    return (
        <Card>
            <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary-light text-primary">
                    <span className="material-symbols-outlined text-xl">{icon}</span>
                </div>
                <dl className="flex-1 space-y-1.5">
                    {sections.map((section) => (
                        <div key={section.name} className="text-xs">
                            <dt className="font-bold text-primary-dark">{section.name}</dt>
                            <dd className="text-ink">{section.items.join(', ')}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </Card>
    );
}
