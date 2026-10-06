import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Coffee, Egg, Leaf, Soup, UtensilsCrossed } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

import type { MealKey } from '#/lib/restaurant';
import type { Campus, MenuSection } from '#/queries/restaurant';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderToggle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { usePageState } from '#/components/PageState';
import { RestaurantAccount } from '#/components/ru/RestaurantAccount';
import { ShareButton } from '#/components/ShareButton';
import { Button } from '#/components/ui/button';
import { Card, CardContent } from '#/components/ui/card';
import { Label } from '#/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '#/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs';
import { WeekDayPicker } from '#/components/WeekDayPicker';
import { currentOrNextMeal, highlightMenu, MEAL_TIMES } from '#/lib/restaurant';
import { nowInBrasilia, weekDays } from '#/lib/schedule';
import { meQueryOptions } from '#/queries/me';
import { CAMPUS_LABELS, campusOf, menuQueryOptions } from '#/queries/restaurant';
import {
    credentialsQueryOptions,
    restoreRestaurantAccount,
    statementQueryOptions
} from '#/queries/restaurant-account';

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };
const MEALS = MEAL_TIMES.map(({ key, label, start, end }) => ({
    key,
    label,
    start,
    end,
    icon: MEAL_ICONS[key]
}));

interface AlternativeInfo {
    label: string;
    icon: React.FC<{ className?: string }>;
}

const ALTERNATIVES: Partial<Record<NonNullable<MenuSection['key']>, AlternativeInfo>> = {
    main_dish_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    main_dish_vegan: { label: 'Vegetariano estrito', icon: Leaf },
    complement_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    complement_vegan: { label: 'Vegetariano estrito', icon: Leaf }
};

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
    const { data, isPending, isError, refetch } = useQuery(
        menuQueryOptions({ date: selectedDate, campus })
    );
    const menu = data?.[0];
    const meal = MEALS.find((item) => item.key === selectedMeal) ?? MEALS[1];
    const sections = menu?.[selectedMeal] ?? [];

    return (
        <>
            {filtersOpen && (
                <div>
                    <WeekDayPicker
                        days={weekDays(today)}
                        selectedDate={selectedDate}
                        onSelect={(day) => setSelectedDate(day.date)}
                    />

                    <div className="mb-5">
                        <Label
                            htmlFor="menu-campus"
                            className="mb-2 px-1 text-xs text-muted-foreground"
                        >
                            Campus
                        </Label>
                        <Select
                            items={CAMPUS_OPTIONS.map((option) => ({
                                value: option,
                                label: CAMPUS_LABELS[option]
                            }))}
                            value={campus}
                            onValueChange={(value) => {
                                const selected = CAMPUS_OPTIONS.find((option) => option === value);
                                if (selected) setPickedCampus(selected);
                            }}
                        >
                            <SelectTrigger id="menu-campus" className="w-full bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CAMPUS_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {CAMPUS_LABELS[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            <Tabs
                value={selectedMeal}
                onValueChange={(value) => {
                    const selected = MEALS.find((item) => item.key === value);
                    if (selected) setSelectedMeal(selected.key);
                }}
            >
                <TabsList
                    className="w-full group-data-horizontal/tabs:h-auto"
                    aria-label="Escolher refeição"
                >
                    {MEALS.map((item) => (
                        <TabsTrigger
                            key={item.key}
                            value={item.key}
                            className="h-auto flex-col gap-1 py-3 text-xs"
                        >
                            <item.icon className="size-5" aria-hidden="true" />
                            {item.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value={selectedMeal} className="mt-4">
                    <p className="mb-4 px-1 text-xs font-bold text-muted-foreground">
                        {meal.start}–{meal.end} · {selectedDate.split('-').toReversed().join('/')}
                    </p>
                    {sections.length > 0 ? (
                        <MealDetails sections={sections} />
                    ) : (
                        <p className="px-1 text-sm text-muted-foreground">
                            {isPending && <LoadingText>Carregando cardápio...</LoadingText>}
                            {isError && (
                                <>
                                    O site do RU não respondeu.{' '}
                                    <Button
                                        variant="link"
                                        size="xs"
                                        onClick={() => refetch()}
                                        className="h-auto p-0"
                                    >
                                        Tentar novamente
                                    </Button>
                                </>
                            )}
                            {!isPending &&
                                !isError &&
                                'Cardápio não publicado para esta refeição neste dia.'}
                        </p>
                    )}
                </TabsContent>
            </Tabs>

            {user ? (
                <RestaurantAccount key={user.registration} registration={user.registration} />
            ) : (
                <Card className="mt-8">
                    <CardContent className="text-muted-foreground">
                        <Link to="/login" className="font-bold text-primary hover:underline">
                            Entre com o SIGAA
                        </Link>{' '}
                        para ver seu saldo, extrato e carteirinha do RU.
                    </CardContent>
                </Card>
            )}
        </>
    );
}

function MealDetails({ sections }: { sections: MenuSection[] }) {
    const { main, alternatives, others } = highlightMenu(sections);

    return (
        <div className="space-y-4">
            {main && <MealHighlight main={main} alternatives={alternatives} />}
            {others.length > 0 && (
                <Card size="sm">
                    <CardContent>
                        <dl className="divide-y divide-border">
                            {others.map((section) => (
                                <div
                                    key={section.name}
                                    className="flex gap-4 py-3 first:pt-0 last:pb-0"
                                >
                                    <dt className="w-28 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground">
                                        {section.name}
                                    </dt>
                                    <dd className="min-w-0 flex-1 space-y-1 text-sm leading-snug font-semibold text-foreground">
                                        {section.items.map((item) => (
                                            <p key={item}>{item}</p>
                                        ))}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function MealHighlight({ main, alternatives }: { main: MenuSection; alternatives: MenuSection[] }) {
    return (
        <section aria-label={main.name}>
            <Card className="bg-primary/5 ring-primary/30">
                <CardContent>
                    <p className="text-xs font-semibold text-primary">{main.name}</p>
                    <div className="mt-1 space-y-1">
                        {main.items.map((item) => (
                            <p
                                key={item}
                                className="text-xl leading-tight font-bold tracking-tight"
                            >
                                {item}
                            </p>
                        ))}
                    </div>

                    {alternatives.length > 0 && (
                        <ul className="mt-4 space-y-3 border-t border-primary/15 pt-4">
                            {alternatives.map((section) => {
                                const info = section.key ? ALTERNATIVES[section.key] : undefined;
                                const Icon = info?.icon ?? Leaf;
                                return (
                                    <li key={section.name} className="flex items-center gap-3">
                                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                            <Icon className="size-4" aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="text-xs text-muted-foreground">
                                                {info?.label ?? section.name}
                                            </p>
                                            <p className="text-sm leading-snug font-semibold">
                                                {section.items.join(', ')}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </section>
    );
}
