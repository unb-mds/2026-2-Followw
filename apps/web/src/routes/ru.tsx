import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import type { MenuSection } from '#/queries/restaurant';

import { Card } from '#/components/ui/Card';
import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { SectionHeader } from '#/components/ui/SectionHeader';
import { nowInBrasilia } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { menuQueryOptions } from '#/queries/restaurant';

const MEALS = [
    { key: 'breakfast', label: 'Café da manhã', icon: 'coffee' },
    { key: 'lunch', label: 'Almoço', icon: 'lunch_dining' },
    { key: 'dinner', label: 'Jantar', icon: 'dinner_dining' }
] as const;

export const Route = createFileRoute('/ru')({
    loader: async ({ context: { queryClient } }) => {
        const user = await queryClient.query(meQueryOptions);
        await queryClient.prefetchQuery(menuQueryOptions({ date: nowInBrasilia().date, user }));
    },
    errorComponent: ErrorState,
    component: RUPage
});

function RUPage() {
    const [today] = useState(() => nowInBrasilia().date);
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const { data, isPending, isError, refetch } = useQuery(menuQueryOptions({ date: today, user }));
    const menu = data?.[0];
    const meals = MEALS.filter((meal) => menu?.[meal.key]?.length);

    return (
        <>
            <HeaderBar>
                <h1 className="text-3xl leading-none font-bold tracking-tight text-ink">
                    Cardápio
                </h1>
            </HeaderBar>

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
