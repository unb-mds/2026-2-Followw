import type { Day } from '@followw/core/lib/schedule.ts';
import type { Campus, DailyMenu } from '@followw/core/queries/restaurant.ts';

import { formatMenuDay, previewMenuMeals } from '@followw/core/lib/restaurant.ts';
import { nowInBrasilia } from '@followw/core/lib/schedule.ts';
import { CAMPUS_LABELS } from '@followw/core/queries/restaurant.ts';
import { useRouter } from 'expo-router';
import { Coffee, Soup, UtensilsCrossed } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { LoadingText } from '@/components/LoadingText';
import { SectionHeader } from '@/components/SectionHeader';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const MEAL_ICONS = { breakfast: Coffee, lunch: UtensilsCrossed, dinner: Soup };

interface PublicInfoSectionProps {
    campus: Campus;
    menus?: DailyMenu[];
    isLoading?: boolean;
    // rótulo do dia exibido: "Hoje", "Quarta-feira"...
    day: string;
    date?: string;
    now?: Day & { time: string };
}

export function PublicInfoSection({
    campus,
    menus,
    isLoading,
    day,
    date,
    now = nowInBrasilia()
}: PublicInfoSectionProps) {
    const router = useRouter();
    const selectedDate = date ?? now.date;
    const isToday = selectedDate === now.date;
    const meals = previewMenuMeals(menus ?? [], selectedDate, now);
    const published = meals.filter((meal) => meal.dish);
    const next = meals[0];

    return (
        <View accessibilityLabel="RU">
            <SectionHeader title="RU" actionLabel="Ver Cardápio" actionHref="/ru" />
            <Pressable
                accessibilityRole="link"
                accessibilityLabel="Ver cardápio do RU"
                onPress={() =>
                    router.navigate({
                        pathname: '/ru',
                        params: isToday
                            ? { date: next.date, meal: next.key }
                            : { date: selectedDate }
                    })
                }
                className="active:opacity-70"
            >
                <Card size="sm" className="gap-3 p-4">
                    <View className="flex-row items-baseline gap-2">
                        <Text className="text-xs font-semibold text-primary">
                            {isToday ? 'Próxima refeição' : `Pratos principais · ${day}`}
                        </Text>
                        <Text
                            numberOfLines={1}
                            className="ml-auto shrink text-xs font-medium text-muted-foreground"
                        >
                            Campus {CAMPUS_LABELS[campus]}
                        </Text>
                    </View>
                    {isLoading && published.length === 0 ? (
                        <LoadingText className="justify-start py-0">
                            Carregando cardápio...
                        </LoadingText>
                    ) : isToday ? (
                        <NextMeal meal={next} today={now.date} />
                    ) : published.length > 0 ? (
                        <View className="gap-1.5">
                            {published.map((meal) => (
                                <View key={meal.key} className="flex-row items-center gap-2">
                                    <Icon
                                        as={MEAL_ICONS[meal.key]}
                                        className="size-3.5 shrink-0 text-muted-foreground"
                                    />
                                    <Text className="w-24 shrink-0 text-xs text-muted-foreground">
                                        {meal.label}
                                    </Text>
                                    <Text
                                        numberOfLines={1}
                                        className="min-w-0 flex-1 text-sm font-semibold"
                                    >
                                        {meal.dish}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Text className="text-xs text-muted-foreground">
                            {`Cardápio de ${day.toLowerCase()} não publicado.`}
                        </Text>
                    )}
                </Card>
            </Pressable>
        </View>
    );
}

function NextMeal({
    meal,
    today
}: {
    meal: ReturnType<typeof previewMenuMeals>[number];
    today: string;
}) {
    return (
        <View className="gap-2">
            <View className="flex-row items-center gap-2">
                <Icon
                    as={MEAL_ICONS[meal.key]}
                    className="size-3.5 shrink-0 text-muted-foreground"
                />
                <Text role="heading" aria-level={3} className="text-xs text-muted-foreground">
                    {`${meal.label} · ${formatMenuDay(meal.date, today)} · ${meal.start}–${meal.end}`}
                </Text>
            </View>
            {meal.dish ? (
                <Text className="text-2xl font-medium">{meal.dish}</Text>
            ) : (
                <Text className="text-xs text-muted-foreground">
                    {`Cardápio do ${meal.label.toLowerCase()} não publicado.`}
                </Text>
            )}
        </View>
    );
}
