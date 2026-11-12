import { describe, expect, test } from 'bun:test';

import type { DailyMenu } from '#/queries/restaurant';

import { previewMenuMeals } from '#/lib/restaurant';

function menu(date: string): DailyMenu {
    return {
        date,
        breakfast: [{ name: 'Complemento', key: 'complement', items: ['Pão'] }],
        lunch: [{ name: 'Prato', key: 'main_dish', items: ['Frango'] }],
        dinner: [{ name: 'Prato', key: 'main_dish', items: ['Sopa'] }]
    };
}

const date = '2026-11-10';
const menus = [menu(date), menu('2026-11-11')];
const preview = (time: string, data = menus) =>
    previewMenuMeals(data, date, { date, weekday: 2, time }).map(
        (meal) => `${meal.date}:${meal.key}:${meal.dish}`
    );

describe('previewMenuMeals', () => {
    test.each([
        ['06:00', '2026-11-10:breakfast:Pão'],
        ['08:00', '2026-11-10:breakfast:Pão'],
        ['10:00', '2026-11-10:lunch:Frango'],
        ['18:00', '2026-11-10:dinner:Sopa']
    ])('hoje às %s mostra só a refeição atual ou a próxima', (time, expected) => {
        expect(preview(time)).toEqual([expected]);
    });

    test('depois do jantar mostra o café de amanhã', () => {
        expect(preview('22:00')).toEqual(['2026-11-11:breakfast:Pão']);
    });

    test('refeição sem cardápio publicado vem sem prato, sem pular para outra', () => {
        const result = previewMenuMeals([{ ...menu(date), lunch: null }], date, {
            date,
            weekday: 2,
            time: '12:00'
        });

        expect(result).toHaveLength(1);
        expect(result[0].key).toBe('lunch');
        expect(result[0].dish).toBeUndefined();
    });

    test('outro dia retorna as três refeições daquele dia', () => {
        expect(
            previewMenuMeals(menus, '2026-11-11', { date, weekday: 2, time: '08:00' }).map(
                (meal) => `${meal.date}:${meal.key}:${meal.dish}`
            )
        ).toEqual([
            '2026-11-11:breakfast:Pão',
            '2026-11-11:lunch:Frango',
            '2026-11-11:dinner:Sopa'
        ]);
    });
});
