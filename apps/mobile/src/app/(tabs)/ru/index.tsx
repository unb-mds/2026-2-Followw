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
import { Stack, useRouter } from 'expo-router';
import {
    ChevronLeft,
    ChevronRight,
    Coffee,
    ImageDown,
    LogIn,
    QrCode,
    Soup,
    UtensilsCrossed
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { LoadingText } from '@/components/LoadingText';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PageState } from '@/components/PageState';
import { MealDetails } from '@/components/ru/MealDetails';
import { RestaurantAccount } from '@/components/ru/RestaurantAccount';
import { Screen } from '@/components/Screen';
import { TabFilter } from '@/components/TabFilter';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { WeekDayPicker } from '@/components/WeekDayPicker';
import { useColor } from '@/lib/colors';
import { share } from '@/lib/share';
import { cn } from '@/lib/utils';
import { shareMenuImage } from '@/queries/restaurant-share';

export { ErrorState as ErrorBoundary } from '@/components/ErrorState';

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };

export default function RestaurantScreen() {
    const router = useRouter();
    const me = useQuery(meQueryOptions);
    const user = me.data;
    const [opening] = useState(() => currentOrNextMeal(nowInBrasilia()));
    const today = nowInBrasilia().date;
    const [chosen, setChosen] = useState<Partial<RestaurantSelection>>({});
    const selection: RestaurantSelection = {
        date: chosen.date ?? opening.date,
        meal: chosen.meal ?? opening.meal.key,
        campus: chosen.campus ?? campusOf(user?.unit?.code)
    };
    const select = (change: Partial<RestaurantSelection>) => setChosen({ ...chosen, ...change });
    const { date, meal: mealKey, campus } = selection;
    const [sharing, setSharing] = useState(false);

    const menuOptions = menuQueryOptions({ date, campus });
    const menu = useQuery(menuOptions);
    const failureMessage = useFailureMessage('O site do RU não respondeu.');
    const meal = MEAL_TIMES.find((item) => item.key === mealKey) ?? MEAL_TIMES[1];
    const sections = menu.data?.[0]?.[mealKey] ?? [];

    const days = weekDays(date, 7);
    const firstDay = weekDays(today, 7)[0].date;
    const isNextWeek = days[0].date > firstDay;
    const shiftWeek = (weeks: number) => () => select({ date: addDays(date, 7 * weeks) });

    async function shareMenu() {
        setSharing(true);
        try {
            await shareMenuImage(selection);
        } catch {
            await share('Cardápio do RU', restaurantSharePath(selection));
        } finally {
            setSharing(false);
        }
    }

    return (
        <Screen
            onRefreshData={(queryClient) =>
                Promise.all([
                    refreshQuery(queryClient, menuOptions),
                    user && refreshQuery(queryClient, statementQueryOptions(user.registration)),
                    user && refreshQuery(queryClient, credentialsQueryOptions(user.registration))
                ])
            }
        >
            <Stack.Screen
                options={{
                    // oxlint-disable-next-line react/no-unstable-nested-components -- headerRight exige função
                    headerRight: () => (
                        <HeaderActions
                            sharing={sharing}
                            canOpenCard={Boolean(user)}
                            onShare={() => void shareMenu()}
                        />
                    )
                }}
            />
            <OfflineBanner />
            <WeekDayPicker
                days={days}
                selectedDate={date}
                onSelect={(day) => select({ date: day.date })}
                week={{
                    label: isNextWeek ? 'Próxima semana' : 'Esta semana',
                    onPrevious: isNextWeek ? shiftWeek(-1) : undefined,
                    onNext: isNextWeek ? undefined : shiftWeek(1)
                }}
            />
            <TabFilter
                label="Campus"
                value={campus}
                options={CAMPUS_OPTIONS}
                labels={CAMPUS_LABELS}
                onChange={(value) => select({ campus: value })}
            />

            <View
                className="flex-row rounded-lg bg-muted p-1"
                accessibilityLabel="Escolher refeição"
            >
                {MEAL_TIMES.map((item) => {
                    const active = item.key === mealKey;
                    return (
                        <Pressable
                            key={item.key}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active }}
                            onPress={() => select({ meal: item.key })}
                            className={cn(
                                'flex-1 items-center gap-1 rounded-md py-3',
                                active && 'bg-background'
                            )}
                        >
                            <Icon
                                as={MEAL_ICONS[item.key]}
                                className={cn('size-5', !active && 'text-muted-foreground')}
                            />
                            <Text
                                className={cn(
                                    'text-xs font-medium',
                                    !active && 'text-muted-foreground'
                                )}
                            >
                                {item.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <View className="flex-row items-center justify-between">
                <Button
                    variant="ghost"
                    size="icon"
                    accessibilityLabel="Dia anterior"
                    disabled={date <= firstDay}
                    onPress={() => select({ date: addDays(date, -1) })}
                >
                    <Icon as={ChevronLeft} />
                </Button>
                <Text className="text-xs font-bold text-muted-foreground">
                    {formatMenuDay(date, today)} · {meal.start}–{meal.end}
                </Text>
                <Button
                    variant="ghost"
                    size="icon"
                    accessibilityLabel="Próximo dia"
                    disabled={date >= addDays(firstDay, 13)}
                    onPress={() => select({ date: addDays(date, 1) })}
                >
                    <Icon as={ChevronRight} />
                </Button>
            </View>

            {sections.length > 0 ? (
                <MealDetails sections={sections} />
            ) : (
                <View className="px-1">
                    {menu.isPending && <LoadingText>Carregando cardápio...</LoadingText>}
                    {menu.isLoadingError && (
                        <Text className="text-sm text-muted-foreground">
                            {failureMessage}{' '}
                            <Text
                                className="text-sm font-semibold text-primary"
                                onPress={() => void menu.refetch()}
                            >
                                Tentar novamente
                            </Text>
                        </Text>
                    )}
                    {!menu.isPending && !menu.isLoadingError && (
                        <Text className="text-sm text-muted-foreground">
                            Cardápio não publicado para esta refeição neste dia.
                        </Text>
                    )}
                </View>
            )}

            {user ? (
                <RestaurantAccount key={user.registration} registration={user.registration} />
            ) : (
                !me.isPending && (
                    <PageState
                        icon={LogIn}
                        title="Entre com o SIGAA"
                        message="Veja seu saldo, extrato e carteirinha do RU."
                    >
                        <Button onPress={() => router.push('/login')}>
                            <Text>Entrar</Text>
                        </Button>
                    </PageState>
                )
            )}
        </Screen>
    );
}

function HeaderActions({
    sharing,
    canOpenCard,
    onShare
}: {
    sharing: boolean;
    canOpenCard: boolean;
    onShare: () => void;
}) {
    const router = useRouter();
    const muted = useColor('muted-foreground');
    return (
        <View className="flex-row items-center gap-1">
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="Compartilhar cardápio"
                hitSlop={8}
                disabled={sharing}
                onPress={onShare}
                className="size-9 items-center justify-center active:opacity-60"
            >
                {sharing ? (
                    <ActivityIndicator color={muted} />
                ) : (
                    <Icon as={ImageDown} className="size-5 text-primary" />
                )}
            </Pressable>
            {canOpenCard && (
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ver QR code da carteirinha"
                    hitSlop={8}
                    onPress={() => router.push('/ru/carteirinha')}
                    className="size-9 items-center justify-center active:opacity-60"
                >
                    <Icon as={QrCode} className="size-5 text-primary" />
                </Pressable>
            )}
        </View>
    );
}
