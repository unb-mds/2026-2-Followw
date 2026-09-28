import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ChevronDown, Coffee, Soup, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';

import type { Campus, MenuSection } from '#/queries/restaurant';

import { ErrorState } from '#/components/ui/ErrorState';
import { HeaderBar } from '#/components/ui/HeaderBar';
import { WeekDayPicker } from '#/components/ui/WeekDayPicker';
import { nowInBrasilia, weekDays } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { CAMPUS_LABELS, campusOf, menuQueryOptions } from '#/queries/restaurant';

const MEALS = [
    { key: 'breakfast', label: 'Café da manhã', icon: Coffee },
    { key: 'lunch', label: 'Almoço', icon: UtensilsCrossed },
    { key: 'dinner', label: 'Jantar', icon: Soup }
] as const;

type MealKey = (typeof MEALS)[number]['key'];
const CAMPUS_OPTIONS: Campus[] = ['Darcy', 'Gama', 'Ceilandia', 'Planaltina', 'Fazenda'];

export const Route = createFileRoute('/ru')({
    loader: async ({ context: { queryClient } }) => {
        const today = nowInBrasilia().date;
        const user = await queryClient.query(meQueryOptions);
        await queryClient.query(menuQueryOptions({ date: today, user })).catch(noop);
        return { today };
    },
    errorComponent: ErrorState,
    component: RUPage
});

function RUPage() {
    const { today } = Route.useLoaderData();
    const [selectedDate, setSelectedDate] = useState(today);
    const [showFilters, setShowFilters] = useState(false);
    const [selectedMeal, setSelectedMeal] = useState<MealKey>('lunch');
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const [pickedCampus, setPickedCampus] = useState<Campus | null>(null);
    const campus = pickedCampus ?? campusOf(user?.unity);
    const { data, isPending, isError, refetch } = useQuery(
        menuQueryOptions({ date: selectedDate, campus })
    );
    const menu = data?.[0];
    const meal = MEALS.find((item) => item.key === selectedMeal) ?? MEALS[1];
    const sections = menu?.[selectedMeal] ?? [];

    return (
        <>
            <HeaderBar>
                <button
                    type="button"
                    onClick={() => setShowFilters(!showFilters)}
                    aria-expanded={showFilters}
                    className="group flex cursor-pointer items-center gap-1 text-left select-none focus:outline-none"
                    title={showFilters ? 'Ocultar dia e campus' : 'Escolher dia e campus'}
                >
                    <h1 className="text-3xl leading-none font-bold tracking-tight text-ink transition-colors group-hover:text-primary">
                        Cardápio
                    </h1>
                    <ChevronDown
                        className={`size-4 text-muted transition-transform duration-200 group-hover:text-primary ${
                            showFilters ? 'rotate-180 text-primary' : ''
                        }`}
                    />
                </button>
            </HeaderBar>

            {showFilters && (
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
                            'Cardápio de hoje não publicado para esta refeição.'}
                    </p>
                )}
            </section>
        </>
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
