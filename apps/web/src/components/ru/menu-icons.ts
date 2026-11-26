import type { MenuSection } from '@followw/core/queries/restaurant.ts';

import {
    Apple,
    Carrot,
    Croissant,
    CupSoda,
    Droplet,
    Egg,
    IceCreamCone,
    Leaf,
    type LucideIcon,
    Salad,
    Sandwich,
    Soup,
    Wheat
} from 'lucide-react';

type SectionKey = NonNullable<MenuSection['key']>;

// rótulo curto e ícone das opções vegetarianas do destaque
export const ALTERNATIVES: Partial<Record<SectionKey, { label: string; icon: LucideIcon }>> = {
    main_dish_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    main_dish_vegan: { label: 'Vegetariano estrito', icon: Leaf },
    complement_vegetarian: { label: 'Ovolactovegetariano', icon: Egg },
    complement_vegan: { label: 'Vegetariano estrito', icon: Leaf }
};

export const SECTION_ICONS: Partial<Record<SectionKey, LucideIcon>> = {
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
