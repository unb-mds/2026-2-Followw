import type { MealKey } from '#/lib/restaurant';
import type { Campus } from '#/queries/restaurant';

import { currentOrNextMeal, MEAL_TIMES } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { publicPageHead } from '#/lib/seo';
import { CAMPUS_LABELS, CAMPUS_OPTIONS } from '#/queries/restaurant';

export interface RestaurantSearch {
    date?: string;
    meal?: MealKey;
    campus?: Campus;
    theme?: 'light' | 'dark';
}

export interface RestaurantSelection {
    date: string;
    meal: MealKey;
    campus: Campus;
    theme?: 'light' | 'dark';
}

export function validateRestaurantSearch(search: Record<string, unknown>): RestaurantSearch {
    const result: RestaurantSearch = {};
    if (
        typeof search.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(search.date) &&
        !Number.isNaN(Date.parse(search.date)) &&
        new Date(search.date).toISOString().slice(0, 10) === search.date
    )
        result.date = search.date;
    const meal = MEAL_TIMES.find(({ key }) => key === search.meal);
    if (meal) result.meal = meal.key;
    const campus = CAMPUS_OPTIONS.find((option) => option === search.campus);
    if (campus) result.campus = campus;
    if (search.theme === 'light' || search.theme === 'dark') result.theme = search.theme;
    return result;
}

export function restaurantSelection(
    search: RestaurantSearch,
    campus: Campus = 'Darcy'
): RestaurantSelection {
    const initial = currentOrNextMeal(nowInBrasilia());
    return {
        date: search.date ?? initial.date,
        meal: search.meal ?? initial.meal.key,
        campus: search.campus ?? campus,
        ...(search.theme ? { theme: search.theme } : {})
    };
}

export function restaurantSharePath(selection: RestaurantSelection, path = '/ru') {
    const params = new URLSearchParams({
        date: selection.date,
        meal: selection.meal,
        campus: selection.campus
    });
    if (selection.theme) params.set('theme', selection.theme);
    return `${path}?${params}`;
}

export function restaurantPageHead(selection: RestaurantSelection, filtered = true) {
    const meal = MEAL_TIMES.find(({ key }) => key === selection.meal)!;
    const date = selection.date.split('-').toReversed().join('/');
    return publicPageHead({
        path: '/ru',
        search: filtered ? restaurantSharePath(selection).split('?')[1] : undefined,
        title: filtered
            ? `${meal.label} do RU · ${date} | Followw`
            : 'Cardápio do RU UnB | Followw',
        description: `Cardápio do RU UnB — ${CAMPUS_LABELS[selection.campus]}, ${date}, ${meal.start}–${meal.end}. Consulte o cardápio completo no Followw.`,
        image: {
            path: restaurantSharePath(selection, '/share/ru.png'),
            alt: `${meal.label} do RU — ${CAMPUS_LABELS[selection.campus]} — ${date}`
        }
    });
}
