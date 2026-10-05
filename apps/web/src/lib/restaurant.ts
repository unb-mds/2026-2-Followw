import type { Day } from '#/lib/schedule';

import { currentAndNext, nextDays } from '#/lib/schedule';

export const MEAL_TIMES = [
    { key: 'breakfast', start: '07:00', end: '09:30' },
    { key: 'lunch', start: '11:00', end: '14:30' },
    { key: 'dinner', start: '17:00', end: '19:30' }
] as const;

export type MealKey = (typeof MEAL_TIMES)[number]['key'];

export function currentOrNextMeal(now: Day & { time: string }) {
    const { current, next } = currentAndNext([...MEAL_TIMES], now.time);
    return {
        meal: current ?? next ?? MEAL_TIMES[0],
        date: current || next ? now.date : nextDays(now.date, 2)[1].date
    };
}

export function cardIsExpired(validUntil: string, date: string): boolean {
    // O SIGAA informa mês/ano; a API representa o mês pelo dia 1.
    return validUntil.slice(0, 7) < date.slice(0, 7);
}
