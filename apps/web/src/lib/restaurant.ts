import type { Day } from '#/lib/schedule';
import type { DailyMenu, MenuSection } from '#/queries/restaurant';

import { daysFrom, formatRelativeDays } from '#/lib/classroom-details';
import { addDays, currentAndNext, nextDays, weekDays } from '#/lib/schedule';

export const MEAL_TIMES = [
    { key: 'breakfast', label: 'Café da manhã', start: '07:00', end: '09:30' },
    { key: 'lunch', label: 'Almoço', start: '11:00', end: '14:30' },
    { key: 'dinner', label: 'Jantar', start: '17:00', end: '19:30' }
] as const;

export type MealKey = (typeof MEAL_TIMES)[number]['key'];

// Mesma janela da API: do primeiro dia com cardápio até o fim da próxima semana.
export const FIRST_MENU_DAY = '2026-09-14';
export const lastMenuDay = (today: string) => addDays(weekDays(today, 7)[6].date, 7);

export function currentOrNextMeal(now: Day & { time: string }) {
    const { current, next } = currentAndNext([...MEAL_TIMES], now.time);
    return {
        meal: current ?? next ?? MEAL_TIMES[0],
        date: current || next ? now.date : nextDays(now.date, 2)[1].date
    };
}

const menuDayFormat = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC'
});

/** `hoje`, `ontem` e `amanhã`; os demais dias como `qua., 05/11`. */
export function formatMenuDay(date: string, today: string) {
    const days = daysFrom(today, date);
    if (Math.abs(days) <= 1) return formatRelativeDays(days);
    return menuDayFormat.format(new Date(`${date}T00:00:00Z`));
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

export function mainMenuDish(sections: MenuSection[] | null | undefined) {
    if (!sections?.length) return undefined;
    const section = highlightMenu(sections).main ?? sections[0];
    return section.items.join(', ') || undefined;
}

export function upcomingMenuMeals(
    menus: readonly DailyMenu[],
    date: string,
    now: Day & { time: string }
) {
    const firstDate = date === now.date ? currentOrNextMeal(now).date : date;
    const afterDinner = date === now.date && firstDate > date;
    const selected = menus
        .filter((menu) => (afterDinner ? menu.date >= firstDate : menu.date === firstDate))
        .toSorted((a, b) => a.date.localeCompare(b.date))
        .find((menu) => MEAL_TIMES.some((meal) => mainMenuDish(menu[meal.key])));
    if (!selected) return [];
    return MEAL_TIMES.flatMap((meal) => {
        if (selected.date === now.date && date === now.date && meal.end <= now.time) return [];
        const dish = mainMenuDish(selected[meal.key]);
        return dish ? [{ ...meal, date: selected.date, dish }] : [];
    });
}

export type MenuMeal = ReturnType<typeof upcomingMenuMeals>[number];
