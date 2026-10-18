import type { inferParserType } from 'nuqs/server';

import {
    createLoader,
    createParser,
    createStandardSchemaV1,
    parseAsStringLiteral
} from 'nuqs/server';

import type { MealKey } from '#/lib/restaurant';
import type { Campus } from '#/queries/restaurant';

import { currentOrNextMeal, MEAL_TIMES } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';
import { publicPageHead } from '#/lib/seo';
import { CAMPUS_LABELS, CAMPUS_OPTIONS } from '#/queries/restaurant';

const parseAsDay = createParser({
    parse: (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
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

export const validateRestaurantSearch = createStandardSchemaV1(restaurantSearchParsers, {
    partialOutput: true
});
export const loadRestaurantSearch = createLoader(restaurantSearchParsers);

export type RestaurantSearch = Partial<inferParserType<typeof restaurantSearchParsers>>;

export interface RestaurantSelection {
    date: string;
    meal: MealKey;
    campus: Campus;
}

export function restaurantSelection(
    search: RestaurantSearch,
    campus: Campus = 'Darcy'
): RestaurantSelection {
    const initial = currentOrNextMeal(nowInBrasilia());
    return {
        date: search.date ?? initial.date,
        meal: search.meal ?? initial.meal.key,
        campus: search.campus ?? campus
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
