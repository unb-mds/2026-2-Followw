import type { MenuSection } from '@followw/core/queries/restaurant.ts';
import type { LucideIcon } from 'lucide-react-native';

import { groupSalads, highlightMenu, renameSections } from '@followw/core/lib/restaurant.ts';
import {
    Apple,
    Carrot,
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
} from 'lucide-react-native';
import { View } from 'react-native';

import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Rise } from '@/lib/motion';
import { cn } from '@/lib/utils';

const ALTERNATIVES: Partial<
    Record<NonNullable<MenuSection['key']>, { label: string; icon: LucideIcon }>
> = {
    main_dish_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    main_dish_vegan: { label: 'Vegetariano estrito', icon: Leaf },
    complement_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    complement_vegan: { label: 'Vegetariano estrito', icon: Leaf }
};

const SECTION_ICONS: Partial<Record<NonNullable<MenuSection['key']>, LucideIcon>> = {
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

export function MealDetails({ sections, cascade }: { sections: MenuSection[]; cascade: boolean }) {
    const { main, alternatives, others: ungrouped } = highlightMenu(sections);
    const others = groupSalads(renameSections(ungrouped));

    return (
        <View className="gap-2">
            {main && (
                <Rise animate={cascade}>
                    <MealHighlight main={main} alternatives={alternatives} />
                </Rise>
            )}
            {others.length > 0 && (
                <View className="overflow-hidden rounded-2xl border border-foreground/10 bg-card shadow-sm shadow-black/5">
                    {others.map((section, index) => (
                        <Rise
                            key={section.name}
                            index={(main ? 1 : 0) + index}
                            animate={cascade}
                            className={cn(
                                'flex-row items-center gap-3 px-3 py-2',
                                index > 0 && 'border-t border-foreground/8'
                            )}
                        >
                            <Icon
                                as={(section.key && SECTION_ICONS[section.key]) || UtensilsCrossed}
                                className="size-5 text-primary"
                            />
                            <View className="min-w-0 flex-1">
                                <Text className="text-xs text-muted-foreground">
                                    {section.name}
                                </Text>
                                {section.items.map((item) => (
                                    <Text
                                        key={item}
                                        className="text-sm leading-snug font-medium text-foreground"
                                    >
                                        {item}
                                    </Text>
                                ))}
                            </View>
                        </Rise>
                    ))}
                </View>
            )}
        </View>
    );
}

function MealHighlight({ main, alternatives }: { main: MenuSection; alternatives: MenuSection[] }) {
    return (
        <View accessibilityLabel={main.name}>
            <Card className="border-primary/30 bg-primary/5 py-3">
                <CardContent className="px-3">
                    <Text className="text-xs font-semibold text-primary">{main.name}</Text>
                    <View className="mt-1 gap-1">
                        {main.items.map((item) => (
                            <Text
                                key={item}
                                className="text-lg leading-tight font-bold tracking-tight"
                            >
                                {item}
                            </Text>
                        ))}
                    </View>

                    {alternatives.length > 0 && (
                        <View className="mt-3 gap-2 border-t border-primary/15 pt-3">
                            {alternatives.map((section) => {
                                const info = section.key ? ALTERNATIVES[section.key] : undefined;
                                return (
                                    <View
                                        key={section.name}
                                        className="flex-row items-center gap-2"
                                    >
                                        <View className="size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
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
        </View>
    );
}
