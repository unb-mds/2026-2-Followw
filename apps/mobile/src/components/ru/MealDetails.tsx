import type { MenuSection } from '@followw/core/queries/restaurant.ts';
import type { LucideIcon } from 'lucide-react-native';

import { highlightMenu } from '@followw/core/lib/restaurant.ts';
import { Egg, Leaf } from 'lucide-react-native';
import { View } from 'react-native';

import { ListCard } from '@/components/ListCard';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

const ALTERNATIVES: Partial<
    Record<NonNullable<MenuSection['key']>, { label: string; icon: LucideIcon }>
> = {
    main_dish_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    main_dish_vegan: { label: 'Vegetariano estrito', icon: Leaf },
    complement_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    complement_vegan: { label: 'Vegetariano estrito', icon: Leaf }
};

export function MealDetails({ sections }: { sections: MenuSection[] }) {
    const { main, alternatives, others } = highlightMenu(sections);
    return (
        <View className="gap-2">
            {main && <MealHighlight main={main} alternatives={alternatives} />}
            {others.length > 0 && (
                <ListCard>
                    {others.map((section) => (
                        <View key={section.name} className="flex-row gap-4 px-4 py-3">
                            <Text className="w-28 pt-0.5 text-xs font-medium text-muted-foreground">
                                {section.name}
                            </Text>
                            <View className="min-w-0 flex-1 gap-1">
                                {section.items.map((item) => (
                                    <Text key={item} className="text-sm leading-snug font-semibold">
                                        {item}
                                    </Text>
                                ))}
                            </View>
                        </View>
                    ))}
                </ListCard>
            )}
        </View>
    );
}

function MealHighlight({ main, alternatives }: { main: MenuSection; alternatives: MenuSection[] }) {
    return (
        <Card className="border-primary/30 bg-primary/5">
            <CardContent className="gap-1">
                <Text className="text-xs font-semibold text-primary">{main.name}</Text>
                {main.items.map((item) => (
                    <Text key={item} className="text-xl leading-tight font-bold tracking-tight">
                        {item}
                    </Text>
                ))}
                {alternatives.length > 0 && (
                    <View className="mt-3 gap-3 border-t border-primary/15 pt-4">
                        {alternatives.map((section) => {
                            const info = section.key ? ALTERNATIVES[section.key] : undefined;
                            return (
                                <View key={section.name} className="flex-row items-center gap-3">
                                    <View className="size-8 items-center justify-center rounded-lg bg-primary/10">
                                        <Icon
                                            as={info?.icon ?? Leaf}
                                            className="size-4 text-primary"
                                        />
                                    </View>
                                    <View className="min-w-0 flex-1">
                                        <Text className="text-xs text-muted-foreground">
                                            {info?.label ?? section.name}
                                        </Text>
                                        <Text className="text-sm leading-snug font-semibold">
                                            {section.items.join(', ')}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}
            </CardContent>
        </Card>
    );
}
