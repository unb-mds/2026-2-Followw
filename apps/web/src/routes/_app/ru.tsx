import { noop, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronDown, Coffee, Soup, UtensilsCrossed } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import type { MealKey } from '#/lib/restaurant';
import type { Campus, MenuSection } from '#/queries/restaurant';

import { usePageState } from '#/components/PageState';
import { RestaurantAccount } from '#/components/ru/RestaurantAccount';
import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/ui/HeaderBar';
import { PullToRefresh } from '#/components/ui/PullToRefresh';
import { ShareButton } from '#/components/ui/ShareButton';
import { WeekDayPicker } from '#/components/ui/WeekDayPicker';
import { currentOrNextMeal, MEAL_TIMES } from '#/lib/restaurant';
import { nowInBrasilia, weekDays } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';
import { CAMPUS_LABELS, campusOf, menuQueryOptions } from '#/queries/restaurant';
import {
    credentialsQueryOptions,
    restoreRestaurantAccount,
    statementQueryOptions
} from '#/queries/restaurant-account';

const MEALS = [
    { key: 'breakfast', label: 'Café da manhã', icon: Coffee },
    { key: 'lunch', label: 'Almoço', icon: UtensilsCrossed },
    { key: 'dinner', label: 'Jantar', icon: Soup }
] as const;

const CAMPUS_OPTIONS: Campus[] = ['Darcy', 'Gama', 'Ceilandia', 'Planaltina', 'Fazenda'];
const subscribe = () => () => {};

export const Route = createFileRoute('/_app/ru')({
    loader: async ({ context: { queryClient } }) => {
        const now = nowInBrasilia();
        const initial = currentOrNextMeal(now);
        const user = await queryClient.query(meQueryOptions);
        if (user) restoreRestaurantAccount(queryClient, user.registration);
        await Promise.all([
            queryClient.query(menuQueryOptions({ date: initial.date, user })).catch(noop),
            user && queryClient.query(statementQueryOptions(user.registration)).catch(noop),
            user && queryClient.query(credentialsQueryOptions(user.registration)).catch(noop)
        ]);
        return { today: now.date, initialDate: initial.date, initialMeal: initial.meal.key };
    },
    staticData: { header: RUHeader },
    errorComponent: ErrorState,
    component: RUPage
});

const useFiltersOpen = () => usePageState('filters', false);

function RUHeader() {
    const [filtersOpen, setFiltersOpen] = useFiltersOpen();

    return (
        <HeaderBar actions={<ShareButton title="Cardápio do RU" />}>
            <HeaderToggle
                open={filtersOpen}
                onToggle={() => setFiltersOpen(!filtersOpen)}
                title={filtersOpen ? 'Ocultar dia e campus' : 'Escolher dia e campus'}
            >
                Cardápio
            </HeaderToggle>
        </HeaderBar>
    );
}

function RUPage() {
    const { today, initialDate, initialMeal } = Route.useLoaderData();
    const hydrated = useSyncExternalStore(
        subscribe,
        () => true,
        () => false
    );
    const opening = hydrated ? currentOrNextMeal(nowInBrasilia()) : null;
    const [pickedDate, setSelectedDate] = useState<string | null>(null);
    const selectedDate = pickedDate ?? opening?.date ?? initialDate;
    const [filtersOpen] = useFiltersOpen();
    const [pickedMeal, setSelectedMeal] = useState<MealKey | null>(null);
    const selectedMeal = pickedMeal ?? opening?.meal.key ?? initialMeal;
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const [pickedCampus, setPickedCampus] = useState<Campus | null>(null);
    const campus = pickedCampus ?? campusOf(user?.unity);
    const queryClient = useQueryClient();
    const menuQuery = menuQueryOptions({ date: selectedDate, campus });
    const { data, isPending, isError, refetch } = useQuery(menuQuery);
    const menu = data?.[0];
    const meal = MEALS.find((item) => item.key === selectedMeal) ?? MEALS[1];
    const sections = menu?.[selectedMeal] ?? [];
    const mealTime = MEAL_TIMES.find((item) => item.key === selectedMeal)!;

    const refresh = () =>
        Promise.all([
            refreshQuery(queryClient, menuQuery),
            user && refreshQuery(queryClient, statementQueryOptions(user.registration)),
            user && refreshQuery(queryClient, credentialsQueryOptions(user.registration))
        ]);

    return (
        <PullToRefresh onRefresh={refresh}>
            {filtersOpen && (
                <div>
                    <WeekDayPicker
                        days={weekDays(today)}
                        selectedDate={selectedDate}
                        onSelect={(day) => setSelectedDate(day.date)}
                    />

                    <div className="relative mb-5">
                        <label
                            htmlFor="menu-campus"
                            className="mb-1 block px-1 text-xs font-bold text-muted"
                        >
                            Campus
                        </label>
                        <select
                            id="menu-campus"
                            value={campus}
                            onChange={(event) => {
                                const selected = CAMPUS_OPTIONS.find(
                                    (option) => option === event.target.value
                                );
                                if (selected) setPickedCampus(selected);
                            }}
                            className="w-full cursor-pointer appearance-none rounded-xl border border-line bg-white/80 px-4 py-3 pr-10 text-sm font-bold text-ink shadow-sm outline-none focus:border-primary"
                        >
                            {CAMPUS_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {CAMPUS_LABELS[option]}
                                </option>
                            ))}
                        </select>
                        <ChevronDown
                            className="pointer-events-none absolute top-9 right-3 size-4 text-muted"
                            aria-hidden="true"
                        />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-3 gap-2" aria-label="Escolher refeição">
                {MEALS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        aria-pressed={selectedMeal === item.key}
                        onClick={() => setSelectedMeal(item.key)}
                        className={[
                            'flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-1 py-3 text-xs font-bold transition-colors',
                            selectedMeal === item.key
                                ? 'border-primary bg-primary text-white shadow-sm'
                                : 'border-line bg-white/80 text-muted hover:border-primary hover:text-primary-dark'
                        ].join(' ')}
                    >
                        <item.icon className="size-5" aria-hidden="true" />
                        {item.label}
                    </button>
                ))}
            </div>

            <section className="mt-6" aria-label={meal.label}>
                <p className="mb-4 px-1 text-xs font-bold text-muted">
                    {mealTime.start}–{mealTime.end} ·{' '}
                    {selectedDate.split('-').toReversed().join('/')}
                </p>
                {sections.length > 0 ? (
                    <MealDetails sections={sections} />
                ) : (
                    <p className="px-1 text-sm text-muted">
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
                        {!isPending &&
                            !isError &&
                            'Cardápio não publicado para esta refeição neste dia.'}
                    </p>
                )}
            </section>

            {user ? (
                <RestaurantAccount key={user.registration} registration={user.registration} />
            ) : (
                <p className="mt-8 rounded-2xl border border-line bg-white p-4 text-sm text-muted">
                    <Link to="/login" className="font-bold text-primary-dark">
                        Entre com o SIGAA
                    </Link>{' '}
                    para ver seu saldo, extrato e carteirinha do RU.
                </p>
            )}
        </PullToRefresh>
    );
}

function MealDetails({ sections }: { sections: MenuSection[] }) {
    return (
        <dl className="divide-y divide-line/80 px-1">
            {sections.map((section) => (
                <div key={section.name} className="py-3 first:pt-0">
                    <dt className="text-xs font-extrabold tracking-wide text-primary-dark uppercase">
                        {section.name}
                    </dt>
                    <dd className="mt-1">
                        <ul className="space-y-1">
                            {section.items.map((item) => (
                                <li
                                    key={item}
                                    className="text-base leading-snug font-semibold text-ink"
                                >
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </dd>
                </div>
            ))}
        </dl>
    );
}
