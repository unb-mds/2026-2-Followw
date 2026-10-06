import type { Day } from '#/lib/schedule';
import type { MenuSection } from '#/queries/restaurant';

import { currentAndNext, nextDays } from '#/lib/schedule';

export const MEAL_TIMES = [
    { key: 'breakfast', label: 'Café da manhã', start: '07:00', end: '09:30' },
    { key: 'lunch', label: 'Almoço', start: '11:00', end: '14:30' },
    { key: 'dinner', label: 'Jantar', start: '17:00', end: '19:30' }
] as const;

export type MealKey = (typeof MEAL_TIMES)[number]['key'];

export function currentOrNextMeal(now: Day & { time: string }) {
    const { current, next } = currentAndNext([...MEAL_TIMES], now.time);
    return {
        meal: current ?? next ?? MEAL_TIMES[0],
        date: current || next ? now.date : nextDays(now.date, 2)[1].date
    };
}

const MEAL_PRICES_IN_CENTS = {
    2: { breakfast: 200, lunch: 450, dinner: 450 },
    4: { breakfast: 150, lunch: 250, dinner: 250 }
} as const;

export function insufficientMealBalance(
    balance: string | null | undefined,
    group: number | null | undefined,
    now: Day & { time: string }
) {
    if (balance == null || balance.trim() === '' || (group !== 2 && group !== 4)) return null;
    const { meal } = currentOrNextMeal(now);
    const price = MEAL_PRICES_IN_CENTS[group][meal.key];
    const balanceInCents = Math.round(Number(balance) * 100);
    if (!Number.isFinite(balanceInCents) || balanceInCents >= price) return null;
    return { meal, price: price / 100, shortfall: (price - balanceInCents) / 100 };
}

export function cardIsExpired(validUntil: string, date: string): boolean {
    // O SIGAA informa mês/ano; a API representa o mês pelo dia 1.
    return validUntil.slice(0, 7) < date.slice(0, 7);
}

type SectionKey = NonNullable<MenuSection['key']>;

const HIGHLIGHTS: { key: SectionKey; alternatives: SectionKey[] }[] = [
    { key: 'main_dish', alternatives: ['main_dish_vegetarian', 'main_dish_vegan'] },
    { key: 'complement', alternatives: ['complement_vegetarian', 'complement_vegan'] }
];

// Separa o prato principal (ou complemento, no café) e suas opções vegetarianas do resto.
export function highlightMenu(sections: MenuSection[]) {
    for (const { key, alternatives } of HIGHLIGHTS) {
        const main = sections.find((section) => section.key === key);
        if (!main) continue;
        const grouped = new Set([key, ...alternatives]);
        return {
            main,
            alternatives: sections.filter((s) => s.key && alternatives.includes(s.key)),
            others: sections.filter((s) => !s.key || !grouped.has(s.key))
        };
    }
    return { main: null, alternatives: [], others: sections };
}
