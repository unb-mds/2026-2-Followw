import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import { Coffee, Egg, Leaf, Soup, UtensilsCrossed } from 'lucide-react';
import { useQueryStates } from 'nuqs';
import { useEffect, useSyncExternalStore } from 'react';

import type { RestaurantSelection } from '#/lib/restaurant-share';
import type { MenuSection } from '#/queries/restaurant';

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
import { useFailureMessage } from '#/lib/online';
import { currentOrNextMeal, highlightMenu, MEAL_TIMES } from '#/lib/restaurant';
import {
    loadRestaurantSearch,
    restaurantPageHead,
    restaurantSearchParsers,
    restaurantSelection,
    restaurantSharePath,
    validateRestaurantSearch
} from '#/lib/restaurant-share';
import { addDays, nowInBrasilia, weekDays } from '#/lib/schedule';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { CAMPUS_LABELS, CAMPUS_OPTIONS, campusOf, menuQueryOptions } from '#/queries/restaurant';
import { credentialsQueryOptions, statementQueryOptions } from '#/queries/restaurant-account';

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

declare module '@tanstack/history' {
    interface HistoryState {
        // pedido da navbar para abrir a carteirinha
        studentCard?: boolean;
    }
}

const subscribe = () => () => {};

export const Route = createFileRoute('/_app/ru')({
    validateSearch: validateRestaurantSearch,
    // Trocar dia, refeição ou campus só muda a URL: o componente consulta o cardápio.
    shouldReload: ({ cause }) => cause !== 'stay',
    loader: async ({ context: { queryClient }, location }) => {
        const now = nowInBrasilia();
        const search = loadRestaurantSearch(location.searchStr);
        const opening = currentOrNextMeal(now);
        const user = await loadQuery(queryClient, meQueryOptions);
        await Promise.all([
            loadQuery(
                queryClient,
                menuQueryOptions({
                    date: search.data ?? opening.date,
                    campus: search.campus ?? undefined,
                    user
                })
            ).catch(noop),
            user && loadQuery(queryClient, statementQueryOptions(user.registration)).catch(noop),
            user && loadQuery(queryClient, credentialsQueryOptions(user.registration)).catch(noop)
        ]);
        // Só os padrões: a URL guarda apenas o que difere deles.
        return {
            today: now.date,
            defaultDate: opening.date,
            defaultMeal: opening.meal.key,
            defaultCampus: campusOf(user?.unit?.code)
        };
    },
    head: ({ loaderData, match }) =>
        restaurantPageHead(
            {
                date: match?.search.data ?? loaderData?.defaultDate ?? restaurantSelection({}).date,
                meal:
                    match?.search.refeicao ??
                    loaderData?.defaultMeal ??
                    restaurantSelection({}).meal,
                campus: match?.search.campus ?? loaderData?.defaultCampus ?? 'Darcy'
            },
            Boolean(match?.search.data || match?.search.refeicao || match?.search.campus)
        ),
    staticData: { header: RUHeader },
    errorComponent: ErrorState,
    component: RUPage
});

const useFiltersOpen = () => usePageState('filters', false);

function RUHeader() {
    const [filtersOpen, setFiltersOpen] = useFiltersOpen();
    const { selection } = useMenuSelection();

    return (
        <HeaderBar
            actions={
                <ShareButton title="Cardápio do RU" url={() => restaurantSharePath(selection)} />
            }
        >
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

function useMenuSelection() {
    // sem loaderData enquanto a rota carrega ou falha, e o header já renderiza
    const loaded = Route.useLoaderData({ select: (data) => data });
    const { data: user } = useQuery(meQueryOptions);
    const [search, setSearch] = useQueryStates(restaurantSearchParsers, {
        history: 'replace',
        scroll: false
    });
    const hydrated = useSyncExternalStore(
        subscribe,
        () => true,
        () => false
    );
    const opening = currentOrNextMeal(nowInBrasilia());
    const defaultCampus = loaded?.defaultCampus ?? campusOf(user?.unit?.code);
    const defaults: RestaurantSelection =
        loaded && !hydrated
            ? { date: loaded.defaultDate, meal: loaded.defaultMeal, campus: defaultCampus }
            : { date: opening.date, meal: opening.meal.key, campus: defaultCampus };
    const selection: RestaurantSelection = {
        date: search.data ?? defaults.date,
        meal: search.refeicao ?? defaults.meal,
        campus: search.campus ?? defaults.campus
    };
    // O padrão sai da URL; o link de compartilhamento leva a seleção completa.
    const select = (change: Partial<RestaurantSelection>) => {
        const { date, meal, campus } = { ...selection, ...change };
        void setSearch({
            data: date === defaults.date ? null : date,
            refeicao: meal === defaults.meal ? null : meal,
            campus: campus === defaults.campus ? null : campus
        });
    };
    return { selection, select };
}

function RUPage() {
    const { today } = Route.useLoaderData();
    const {
        selection: { date: selectedDate, meal: selectedMeal, campus },
        select
    } = useMenuSelection();
    const [filtersOpen] = useFiltersOpen();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const cardRequested = useLocation({ select: (location) => location.state.studentCard });
    const navigate = useNavigate();
    // limpa o pedido para não reabrir ao voltar ou recarregar
    useEffect(() => {
        if (cardRequested) void navigate({ to: '.', search: true, replace: true, state: {} });
    }, [cardRequested, navigate]);
    const { data, isPending, isLoadingError, refetch } = useQuery(
        menuQueryOptions({ date: selectedDate, campus })
    );
    const failureMessage = useFailureMessage('O site do RU não respondeu.');
    const menu = data?.[0];
    const meal = MEALS.find((item) => item.key === selectedMeal) ?? MEALS[1];
    const sections = menu?.[selectedMeal] ?? [];
    // Só esta semana e a próxima; trocar de semana mantém o dia da semana.
    const days = weekDays(selectedDate, 7);
    const isNextWeek = days[0].date > weekDays(today, 7)[0].date;
    const shiftWeek = (weeks: number) => () => select({ date: addDays(selectedDate, 7 * weeks) });

    return (
        <>
            {filtersOpen && (
                <div>
                    <WeekDayPicker
                        days={days}
                        selectedDate={selectedDate}
                        onSelect={(day) => select({ date: day.date })}
                        week={{
                            label: isNextWeek ? 'Próxima semana' : 'Esta semana',
                            onPrevious: isNextWeek ? shiftWeek(-1) : undefined,
                            onNext: isNextWeek ? undefined : shiftWeek(1)
                        }}
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
                                if (selected) select({ campus: selected });
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
                    if (selected) select({ meal: selected.key });
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
                            {isLoadingError && (
                                <>
                                    {failureMessage}{' '}
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
                                !isLoadingError &&
                                'Cardápio não publicado para esta refeição neste dia.'}
                        </p>
                    )}
                </TabsContent>
            </Tabs>

            {user ? (
                <RestaurantAccount
                    key={user.registration}
                    registration={user.registration}
                    openCard={cardRequested}
                />
            ) : (
                <Card className="mt-4">
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
        <div className="flex flex-col gap-2">
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
                                    <dd className="flex min-w-0 flex-1 flex-col gap-1 text-sm leading-snug font-semibold text-foreground">
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
                    <div className="mt-1 flex flex-col gap-1">
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
                        <ul className="mt-4 flex flex-col gap-3 border-t border-primary/15 pt-4">
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
