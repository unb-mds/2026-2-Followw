import type { inferParserType } from 'nuqs/server';

import { createLoader, createParser, parseAsStringLiteral } from 'nuqs/server';

import type { MealKey } from '#/lib/restaurant';
import type { Campus } from '#/queries/restaurant';

import { currentOrNextMeal, MEAL_TIMES } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { publicPageHead } from '#/lib/seo';
import { CAMPUS_LABELS, CAMPUS_OPTIONS } from '#/queries/restaurant';

const parseAsDay = createParser({
    parse: (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !value.startsWith('0000-') &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value
            ? value
            : null,
    serialize: (value: string) => value
});

export const restaurantSearchParsers = {
    date: parseAsDay,
    meal: parseAsStringLiteral(MEAL_TIMES.map(({ key }) => key)),
    campus: parseAsStringLiteral(CAMPUS_OPTIONS)
};

export const loadRestaurantSearch = createLoader(restaurantSearchParsers);

export type RestaurantSearch = Partial<inferParserType<typeof restaurantSearchParsers>>;

function firstString(value: unknown) {
    const first: unknown = Array.isArray(value) ? value[0] : value;
    return typeof first === 'string' ? first : undefined;
}

export function validateRestaurantSearch(search: Record<string, unknown>): RestaurantSearch {
    const { date, meal, campus } = loadRestaurantSearch({
        date: firstString(search.date),
        meal: firstString(search.meal),
        campus: firstString(search.campus)
    });
    return { date: date ?? undefined, meal: meal ?? undefined, campus: campus ?? undefined };
}

export interface RestaurantSelection {
    date: string;
    meal: MealKey;
    campus: Campus;
}

export function restaurantDefaults(
    campus: Campus = 'Darcy',
    now = nowInBrasilia()
): RestaurantSelection {
    const { date, meal } = currentOrNextMeal(now);
    return { date, meal: meal.key, campus };
}

export function restaurantSelection(
    search: RestaurantSearch,
    defaults = restaurantDefaults()
): RestaurantSelection {
    return {
        date: search.date ?? defaults.date,
        meal: search.meal ?? defaults.meal,
        campus: search.campus ?? defaults.campus
    };
}

export function restaurantSharePath(selection: RestaurantSelection, path = '/ru') {
    const params = new URLSearchParams({
        date: selection.date,
        meal: selection.meal,
        campus: selection.campus
    });
    return `${path}?${params}`;
}

export function restaurantPageHead(
    selection: RestaurantSelection,
    filtered = true,
    published = true
) {
    const meal = MEAL_TIMES.find(({ key }) => key === selection.meal)!;
    const date = selection.date.split('-').toReversed().join('/');
    return publicPageHead({
        path: '/ru',
        search: filtered ? restaurantSharePath(selection).split('?')[1] : undefined,
        index: !filtered || published,
        title: filtered
            ? `${meal.label} do RU · ${date} | Followw UnB`
            : 'Cardápio do RU UnB | Followw UnB',
        description: `Cardápio do RU UnB — ${CAMPUS_LABELS[selection.campus]}, ${date}, ${meal.start}–${meal.end}. Consulte o cardápio completo no Followw.`,
        image: {
            path: restaurantSharePath(selection, '/share/ru.png'),
            alt: `${meal.label} do RU — ${CAMPUS_LABELS[selection.campus]} — ${date}`
        }
    });
}
