import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useLocation, useNavigate } from '@tanstack/react-router';
import {
    Apple,
    Carrot,
    ChevronLeft,
    ChevronRight,
    Coffee,
    Croissant,
    CupSoda,
    Droplet,
    Egg,
    IceCreamCone,
    Leaf,
    Salad,
    Sandwich,
    Soup,
    UtensilsCrossed,
    Wheat
} from 'lucide-react';
import { AnimatePresence, m, type Variants } from 'motion/react';
import { useQueryStates } from 'nuqs';
import { lazy, Suspense, useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import type { RestaurantSelection } from '#/lib/restaurant-share';
import type { DailyMenu, MenuSection } from '#/queries/restaurant';

import { BackToTodayBar } from '#/components/BackToTodayBar';
import { useDesktop } from '#/components/DesktopContext';
import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle, HeaderToggle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { usePageState } from '#/components/PageState';
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
import { easeIn, rise, useEntrance } from '#/lib/motion';
import { useFailureMessage } from '#/lib/online';
import {
    formatMenuDay,
    groupSalads,
    highlightMenu,
    lastMenuDay,
    MEAL_TIMES,
    type MealKey
} from '#/lib/restaurant';
import {
    restaurantDefaults,
    restaurantPageHead,
    restaurantSearchParsers,
    restaurantSelection,
    restaurantSharePath,
    validateRestaurantSearch
} from '#/lib/restaurant-share';
import { addDays, nowInBrasilia, weekDays } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { CAMPUS_LABELS, CAMPUS_OPTIONS, campusOf, menuQueryOptions } from '#/queries/restaurant';

const RestaurantAccount = lazy(() =>
    import('#/components/ru/RestaurantAccount').then((module) => ({
        default: module.RestaurantAccount
    }))
);

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

const SECTION_ICONS: Partial<Record<NonNullable<MenuSection['key']>, AlternativeInfo['icon']>> = {
    drink: CupSoda,
    bread: Croissant,
    extra: Wheat,
    spread: Droplet,
    fruit: Apple,
    salad_1: Salad,
    salad_2: Salad,
    salad_dressing: Droplet,
    side_dish: Carrot,
    accompaniments: Carrot,
    soup: Soup,
    toast: Sandwich,
    dessert: IceCreamCone,
    complement: Egg
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
        const search = validateRestaurantSearch(location.search);
        const user = await loadQuery(queryClient, meQueryOptions);
        const defaults = restaurantDefaults(campusOf(user?.unit?.code), now);
        const selection = restaurantSelection(search, defaults);
        await loadQuery(queryClient, menuQueryOptions(selection)).catch(noop);
        return { today: now.date, defaults };
    },
    head: ({ loaderData, match }) => {
        const search = match?.search ?? {};
        const selection = restaurantSelection(search, loaderData?.defaults);
        // no SSR, o loader já deixou no cache o cardápio que decide a indexação
        const menus = match?.context.queryClient.getQueryData<DailyMenu[]>(
            menuQueryOptions(selection).queryKey
        );
        return restaurantPageHead(selection, {
            filtered: Boolean(search.date || search.meal || search.campus),
            menus
        });
    },
    staticData: { header: RUHeader },
    errorComponent: ErrorState,
    component: RUPage
});

const useFiltersOpen = () => usePageState('filters', false);

function RUHeader() {
    const desktop = useDesktop();
    const [filtersOpen, setFiltersOpen] = useFiltersOpen();
    const { selection } = useMenuSelection();

    return (
        <HeaderBar
            actions={
                <ShareButton title="Cardápio do RU" url={() => restaurantSharePath(selection)} />
            }
        >
            {desktop ? (
                <HeaderTitle>Cardápio</HeaderTitle>
            ) : (
                <HeaderToggle
                    open={filtersOpen}
                    onToggle={() => setFiltersOpen(!filtersOpen)}
                    title={filtersOpen ? 'Ocultar dia e campus' : 'Escolher dia e campus'}
                >
                    Cardápio
                </HeaderToggle>
            )}
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
    const defaults =
        loaded && !hydrated ? loaded.defaults : restaurantDefaults(campusOf(user?.unit?.code));
    const selection = restaurantSelection(search, defaults);
    // O padrão sai da URL; o link de compartilhamento leva a seleção completa.
    const select = (change: Partial<RestaurantSelection>) => {
        const { date, meal, campus } = { ...selection, ...change };
        void setSearch({
            date: date === defaults.date ? null : date,
            meal: meal === defaults.meal ? null : meal,
            campus: campus === defaults.campus ? null : campus
        });
    };
    return { selection, select, defaults };
}

function RUPage() {
    const desktop = useDesktop();
    const { today } = Route.useLoaderData();
    const {
        selection: { date: selectedDate, meal: selectedMeal, campus },
        select,
        defaults
    } = useMenuSelection();
    const [filtersOpen] = useFiltersOpen();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const cardRequested = useLocation({ select: (location) => location.state.studentCard });
    const navigate = useNavigate();
    const consumeCardRequest = useCallback(() => {
        void navigate({
            to: '.',
            search: true,
            replace: true,
            state: (previous) => ({ ...previous, studentCard: undefined })
        });
    }, [navigate]);
    useEffect(() => {
        if (cardRequested && !user) consumeCardRequest();
    }, [cardRequested, consumeCardRequest, user]);
    const { data, isPending, isLoadingError, refetch } = useQuery(
        menuQueryOptions({ date: selectedDate, campus })
    );
    const failureMessage = useFailureMessage('O site do RU não respondeu.');
    const menu = data?.[0];
    const meal = MEALS.find((item) => item.key === selectedMeal) ?? MEALS[1];
    const sections = menu?.[selectedMeal] ?? [];
    // Só esta semana e a próxima; trocar de semana mantém o dia da semana.
    const days = weekDays(selectedDate, 7);
    const firstDay = weekDays(today, 7)[0].date;
    const isNextWeek = days[0].date > firstDay;
    const shiftWeek = (weeks: number) => () => select({ date: addDays(selectedDate, 7 * weeks) });
    const shiftDay = (offset: number) => () => select({ date: addDays(selectedDate, offset) });

    return (
        <div className="ru-columns lg:grid lg:items-start lg:gap-x-10 lg:gap-y-8">
            {(filtersOpen || desktop) && (
                <div className="ru-filters lg:col-start-2 lg:row-start-2">
                    <div className="lg:rounded-2xl lg:bg-card lg:p-4 lg:shadow-card lg:ring-1 lg:ring-foreground/8">
                        <h2 className="mb-5 hidden text-lg font-bold lg:block">Data e campus</h2>
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
                                    const selected = CAMPUS_OPTIONS.find(
                                        (option) => option === value
                                    );
                                    if (selected) select({ campus: selected });
                                }}
                            >
                                <SelectTrigger
                                    id="menu-campus"
                                    className="w-full bg-background lg:h-12 lg:rounded-xl lg:px-4"
                                >
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
                        <MealPicker
                            selected={selectedMeal}
                            onSelect={(key) => select({ meal: key })}
                        />
                    </div>
                </div>
            )}

            <Tabs
                className="ru-menu lg:col-start-1 lg:row-start-1 lg:row-end-3"
                value={selectedMeal}
                onValueChange={(value) => {
                    const selected = MEALS.find((item) => item.key === value);
                    if (selected) select({ meal: selected.key });
                }}
            >
                <TabsList
                    className="w-full group-data-horizontal/tabs:h-auto lg:hidden"
                    aria-label="Escolher refeição"
                >
                    {MEALS.map((item) => (
                        <TabsTrigger
                            key={item.key}
                            value={item.key}
                            className="h-auto flex-col gap-1 py-3 text-xs lg:flex-row lg:gap-2 lg:rounded-full lg:py-2"
                        >
                            <item.icon className="size-5" aria-hidden="true" />
                            {item.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value={selectedMeal} className="mt-4 lg:mt-0">
                    <div className="mb-4 flex items-center justify-between gap-2">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={shiftDay(-1)}
                            disabled={selectedDate <= firstDay}
                            aria-label="Dia anterior"
                        >
                            <ChevronLeft />
                        </Button>
                        <MenuDayLabel date={selectedDate}>
                            {formatMenuDay(selectedDate, today)} · {meal.start}–{meal.end}
                        </MenuDayLabel>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={shiftDay(1)}
                            disabled={selectedDate >= lastMenuDay(today)}
                            aria-label="Próximo dia"
                        >
                            <ChevronRight />
                        </Button>
                    </div>
                    <div className="flex min-h-60 flex-col gap-2 lg:gap-6">
                        {sections.length > 0 ? (
                            <MealDetails
                                key={`${selectedDate}-${selectedMeal}-${campus}`}
                                sections={sections}
                            />
                        ) : (
                            <div className="my-auto px-1 text-center text-sm text-muted-foreground">
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
                                {!isPending && !isLoadingError && (
                                    <div className="flex flex-col gap-1">
                                        Cardápio não publicado para esta refeição neste dia.
                                        <Link
                                            to="/ru"
                                            search={{}}
                                            className="font-semibold text-primary underline"
                                        >
                                            Ver cardápio atual
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            <div className="ru-account lg:col-start-2 lg:row-start-1">
                {user ? (
                    <Suspense fallback={null}>
                        <RestaurantAccount
                            key={user.registration}
                            registration={user.registration}
                            consumeCardRequest={cardRequested ? consumeCardRequest : undefined}
                        />
                    </Suspense>
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
            </div>
            <BackToTodayBar
                open={selectedDate !== defaults.date}
                onBack={() => select({ date: defaults.date })}
            />
        </div>
    );
}

// no desktop, a refeição é escolhida na coluna lateral
function MealPicker({
    selected,
    onSelect
}: {
    selected: MealKey;
    onSelect: (key: MealKey) => void;
}) {
    return (
        <fieldset className="hidden flex-col gap-1 lg:flex">
            <legend className="sr-only">Escolher refeição</legend>
            {MEALS.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    aria-pressed={item.key === selected}
                    onClick={() => onSelect(item.key)}
                    className={cn(
                        'flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring',
                        item.key === selected && 'bg-muted hover:bg-muted'
                    )}
                >
                    {item.label}
                    <span className="font-semibold text-foreground tabular-nums">
                        {item.start} – {item.end}
                    </span>
                </button>
            ))}
        </fieldset>
    );
}

const slide: Variants = {
    enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (direction: number) => ({
        opacity: 0,
        x: direction * -24,
        transition: { duration: 0.15, ease: easeIn }
    })
};

// desliza para o lado em que o dia mudou
function MenuDayLabel({ date, children }: { date: string; children: React.ReactNode }) {
    const [[previous, direction], setState] = useState([date, 0]);
    if (date !== previous) setState([date, date > previous ? 1 : -1]);

    return (
        <p
            className="relative flex min-w-0 flex-1 justify-center overflow-hidden text-xs font-bold text-muted-foreground"
            aria-live="polite"
        >
            <AnimatePresence initial={false} mode="popLayout" custom={direction}>
                <m.span
                    key={date}
                    custom={direction}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="inline-block"
                >
                    {children}
                </m.span>
            </AnimatePresence>
        </p>
    );
}

function MealDetails({ sections }: { sections: MenuSection[] }) {
    const { main, alternatives, others: ungrouped } = highlightMenu(sections);
    const others = groupSalads(ungrouped);
    const entrance = useEntrance();
    const offset = main ? 1 : 0;

    return (
        <m.div className="flex flex-col gap-3 lg:gap-4" {...entrance}>
            {main && (
                <m.div custom={0} variants={rise}>
                    <MealHighlight main={main} alternatives={alternatives} />
                </m.div>
            )}
            {others.length > 0 && (
                <dl className="grid gap-3 sm:grid-cols-2 lg:gap-4">
                    {others.map((section, index) => {
                        const Icon = (section.key && SECTION_ICONS[section.key]) || UtensilsCrossed;
                        return (
                            <m.div
                                key={section.name}
                                custom={offset + index}
                                variants={rise}
                                className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/8 lg:p-5"
                            >
                                <dt className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    <Icon className="size-4 text-primary" aria-hidden="true" />
                                    {section.name}
                                </dt>
                                <dd className="flex flex-col gap-1.5 text-base leading-snug font-medium text-foreground">
                                    {section.items.map((item) => (
                                        <p key={item}>{item}</p>
                                    ))}
                                </dd>
                            </m.div>
                        );
                    })}
                </dl>
            )}
        </m.div>
    );
}

function MealHighlight({ main, alternatives }: { main: MenuSection; alternatives: MenuSection[] }) {
    return (
        <section aria-label={main.name}>
            <Card className="bg-primary/5 ring-primary/30 lg:py-6">
                <CardContent>
                    <p className="text-xs font-semibold text-primary">{main.name}</p>
                    <div className="mt-1 flex flex-col gap-1">
                        {main.items.map((item) => (
                            <p
                                key={item}
                                className="text-xl leading-tight font-bold tracking-tight lg:mt-3 lg:text-3xl lg:font-medium"
                            >
                                {item}
                            </p>
                        ))}
                    </div>

                    {alternatives.length > 0 && (
                        <ul className="desktop:*:flex-1 mt-4 flex flex-col gap-3 border-t border-primary/15 pt-4 lg:mt-6 lg:flex-row lg:gap-6 lg:pt-6">
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
