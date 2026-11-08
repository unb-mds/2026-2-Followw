import type { Campus, DailyMenu, MenuSection } from '@followw/core/queries/restaurant.ts';

import { highlightMenu } from '@followw/core/lib/restaurant.ts';
import { CAMPUS_LABELS } from '@followw/core/queries/restaurant.ts';
import { Link } from 'expo-router';
import { Coffee, Soup, UtensilsCrossed } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { LoadingText } from '@/components/LoadingText';
import { SectionHeader } from '@/components/SectionHeader';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

interface PublicInfoSectionProps {
    campus: Campus;
    menu?: DailyMenu;
    isLoading?: boolean;
    // rótulo do dia exibido: "Hoje", "Quarta-feira"...
    day: string;
}

function mainDish(sections: MenuSection[] | null | undefined) {
    if (!sections?.length) return undefined;
    const section = highlightMenu(sections).main ?? sections[0];
    return section.items.join(', ');
}

export function PublicInfoSection({ campus, menu, isLoading, day }: PublicInfoSectionProps) {
    const meals = [
        { label: 'Café', icon: Coffee, dish: mainDish(menu?.breakfast) },
        { label: 'Almoço', icon: UtensilsCrossed, dish: mainDish(menu?.lunch) },
        { label: 'Jantar', icon: Soup, dish: mainDish(menu?.dinner) }
    ].filter((meal) => meal.dish);

    return (
        <View accessibilityLabel="RU">
            <SectionHeader title="RU" actionLabel="Ver Cardápio" actionHref="/ru" />
            <Link href="/ru" asChild>
                <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Ver cardápio do RU"
                    className="active:opacity-70"
                >
                    <Card size="sm" className="gap-2 px-3">
                        <View className="flex-row items-baseline gap-2">
                            <Text className="text-xs font-semibold text-primary">
                                Pratos principais · {day}
                            </Text>
                            <Text
                                numberOfLines={1}
                                className="ml-auto shrink text-xs font-medium text-muted-foreground"
                            >
                                Campus {CAMPUS_LABELS[campus]}
                            </Text>
                        </View>
                        {meals.length > 0 ? (
                            <View className="flex-col gap-1.5">
                                {meals.map((meal) => (
                                    <View key={meal.label} className="flex-row items-center gap-2">
                                        <Icon
                                            as={meal.icon}
                                            className="size-3.5 shrink-0 text-muted-foreground"
                                        />
                                        <Text className="w-12 shrink-0 text-xs text-muted-foreground">
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
                        ) : isLoading ? (
                            <LoadingText className="justify-start py-0">
                                Carregando cardápio...
                            </LoadingText>
                        ) : (
                            <Text className="text-xs text-muted-foreground">
                                {`Cardápio de ${day.toLowerCase()} não publicado.`}
                            </Text>
                        )}
                    </Card>
                </Pressable>
            </Link>
        </View>
    );
}
