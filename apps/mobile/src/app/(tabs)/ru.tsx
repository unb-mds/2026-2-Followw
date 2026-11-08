import { useFailureMessage } from '@followw/core/lib/online.ts';
import {
    currentOrNextMeal,
    formatMenuDay,
    MEAL_TIMES,
    restaurantSharePath,
    type RestaurantSelection
} from '@followw/core/lib/restaurant.ts';
import { addDays, nowInBrasilia, weekDays } from '@followw/core/lib/schedule.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import {
    credentialsQueryOptions,
    statementQueryOptions
} from '@followw/core/queries/restaurant-account.ts';
import {
    CAMPUS_LABELS,
    CAMPUS_OPTIONS,
    campusOf,
    menuQueryOptions
} from '@followw/core/queries/restaurant.ts';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Coffee, Soup, UtensilsCrossed } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { HeaderBar, HeaderToggle } from '@/components/HeaderBar';
import { LoadingText } from '@/components/LoadingText';
import { MealDetails } from '@/components/ru/MealDetails';
import { RestaurantAccount } from '@/components/ru/RestaurantAccount';
import { Screen } from '@/components/Screen';
import { ShareButton } from '@/components/ShareButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Text } from '@/components/ui/text';
import { WeekDayPicker } from '@/components/WeekDayPicker';
import { share } from '@/lib/share';
import { shareMenuImage } from '@/queries/restaurant-share';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };
const MEALS = MEAL_TIMES.map(({ key, label, start, end }) => ({
    key,
    label,
    start,
    end,
    icon: MEAL_ICONS[key]
}));

export default function RUPage() {
    const router = useRouter();
    const { carteirinha } = useLocalSearchParams<{ carteirinha?: string }>();
    const { data: user, isPending: userPending } = useQuery(meQueryOptions);
    const [opening] = useState(() => currentOrNextMeal(nowInBrasilia()));
    const today = nowInBrasilia().date;
    const [chosen, setChosen] = useState<Partial<RestaurantSelection>>({});
    const [filtersOpen, setFiltersOpen] = useState(false);
    const selection: RestaurantSelection = {
        date: chosen.date ?? opening.date,
        meal: chosen.meal ?? opening.meal.key,
        campus: chosen.campus ?? campusOf(user?.unit?.code)
    };
    const select = (change: Partial<RestaurantSelection>) => setChosen({ ...chosen, ...change });
    const { date: selectedDate, meal: selectedMeal, campus } = selection;

    // pedido da barra inferior para abrir a carteirinha; limpa para não reabrir
    const cardRequested = carteirinha === '1';
    useEffect(() => {
        if (cardRequested && !userPending) router.setParams({ carteirinha: undefined });
    }, [cardRequested, userPending, router]);

    const menuOptions = menuQueryOptions({ date: selectedDate, campus });
    const { data, isPending, isLoadingError, refetch } = useQuery(menuOptions);
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

    const shareMenu = async () => {
        try {
            await shareMenuImage(selection);
        } catch {
            await share('Cardápio do RU', restaurantSharePath(selection));
        }
    };

    return (
        <Screen
            header={
                <HeaderBar
                    actions={
                        <ShareButton
                            title="Cardápio do RU"
                            path={restaurantSharePath(selection)}
                            onShare={shareMenu}
                        />
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
            }
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, menuOptions),
                    user && refreshQuery(queryClient, statementQueryOptions(user.registration)),
                    user && refreshQuery(queryClient, credentialsQueryOptions(user.registration))
                ])
            }
        >
            {filtersOpen && (
                <View>
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

                    <View className="mb-5">
                        <Label className="mb-2 px-1 text-xs font-normal text-muted-foreground">
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
                            <SelectTrigger className="w-full bg-background">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent title="Campus">
                                {CAMPUS_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>
                                        {CAMPUS_LABELS[option]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </View>
                </View>
            )}

            <Tabs
                value={selectedMeal}
                onValueChange={(value) => {
                    const selected = MEALS.find((item) => item.key === value);
                    if (selected) select({ meal: selected.key });
                }}
            >
                <TabsList className="h-auto w-full" accessibilityLabel="Escolher refeição">
                    {MEALS.map((item) => (
                        <TabsTrigger
                            key={item.key}
                            value={item.key}
                            className="h-auto flex-col gap-1 py-3"
                        >
                            <Icon as={item.icon} className="size-5" />
                            <Text className="text-xs">{item.label}</Text>
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value={selectedMeal} className="mt-4">
                    <View className="mb-4 flex-row items-center justify-between gap-2">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onPress={shiftDay(-1)}
                            disabled={selectedDate <= firstDay}
                            accessibilityLabel="Dia anterior"
                        >
                            <Icon as={ChevronLeft} className="size-4" />
                        </Button>
                        <Text
                            className="text-xs font-bold text-muted-foreground"
                            accessibilityLiveRegion="polite"
                        >
                            {formatMenuDay(selectedDate, today)} · {meal.start}–{meal.end}
                        </Text>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onPress={shiftDay(1)}
                            // só esta semana e a próxima
                            disabled={selectedDate >= addDays(firstDay, 13)}
                            accessibilityLabel="Próximo dia"
                        >
                            <Icon as={ChevronRight} className="size-4" />
                        </Button>
                    </View>
                    {sections.length > 0 ? (
                        <MealDetails sections={sections} />
                    ) : (
                        <View className="px-1">
                            {isPending && (
                                <LoadingText className="justify-start py-0">
                                    Carregando cardápio...
                                </LoadingText>
                            )}
                            {isLoadingError && (
                                <Text className="text-sm text-muted-foreground">
                                    {failureMessage}{' '}
                                    <Text
                                        accessibilityRole="button"
                                        onPress={() => void refetch()}
                                        className="text-xs font-medium text-primary"
                                    >
                                        Tentar novamente
                                    </Text>
                                </Text>
                            )}
                            {!isPending && !isLoadingError && (
                                <Text className="text-sm text-muted-foreground">
                                    Cardápio não publicado para esta refeição neste dia.
                                </Text>
                            )}
                        </View>
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
                !userPending && (
                    <Card className="mt-4">
                        <CardContent>
                            <Text className="text-sm text-muted-foreground">
                                <Text
                                    accessibilityRole="link"
                                    onPress={() => router.push('/login')}
                                    className="text-sm font-bold text-primary"
                                >
                                    Entre com o SIGAA
                                </Text>{' '}
                                para ver seu saldo, extrato e carteirinha do RU.
                            </Text>
                        </CardContent>
                    </Card>
                )
            )}
        </Screen>
    );
}
