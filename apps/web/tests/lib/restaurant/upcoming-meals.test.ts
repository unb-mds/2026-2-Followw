import { describe, expect, test } from 'bun:test';

import type { DailyMenu } from '#/queries/restaurant';

import { upcomingMenuMeals } from '#/lib/restaurant';

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
const next = (time: string, data = menus) =>
    upcomingMenuMeals(data, date, { date, weekday: 2, time });

describe('próximas refeições publicadas', () => {
    test.each([
        ['06:00', ['breakfast', 'lunch']],
        ['08:00', ['breakfast', 'lunch']],
        ['09:30', ['lunch', 'dinner']],
        ['14:30', ['dinner', 'breakfast']],
        ['19:30', ['breakfast', 'lunch']],
        ['23:59', ['breakfast', 'lunch']]
    ] as const)('seleciona as duas próximas refeições às %s', (time, keys) => {
        expect(next(time).map((meal) => meal.key)).toEqual([...keys]);
    });

    test('após o jantar ignora o cardápio encerrado e usa amanhã mesmo fora de ordem', () => {
        expect(next('22:00', menus.toReversed()).map(({ date: day, key }) => [day, key])).toEqual([
            ['2026-11-11', 'breakfast'],
            ['2026-11-11', 'lunch']
        ]);
    });

    test('atravessa domingo e mudança de ano quando os cardápios seguintes estão disponíveis', () => {
        for (const [today, tomorrow] of [
            ['2026-11-15', '2026-11-16'],
            ['2026-12-31', '2027-01-01']
        ]) {
            expect(
                upcomingMenuMeals([menu(today), menu(tomorrow)], today, {
                    date: today,
                    weekday: 0,
                    time: '22:00'
                }).map((meal) => meal.date)
            ).toEqual([tomorrow, tomorrow]);
        }
    });

    test('pula refeições não servidas ou sem prato publicado sem inventar ofertas', () => {
        const tomorrow = { ...menu('2026-11-11'), breakfast: null, lunch: [] };
        const result = next('22:00', [menu(date), tomorrow]);
        expect(result.map((meal) => meal.key)).toEqual(['dinner']);
        expect(next('22:00', [menu(date)])).toEqual([]);
    });

    test('após sábado sem refeições no domingo continua na segunda-feira publicada', () => {
        const saturday = '2026-11-14';
        const sunday = { date: '2026-11-15', breakfast: null, lunch: null, dinner: null };
        const result = upcomingMenuMeals([menu(saturday), sunday, menu('2026-11-16')], saturday, {
            date: saturday,
            weekday: 6,
            time: '22:00'
        });
        expect(result.map((meal) => [meal.date, meal.key])).toEqual([
            ['2026-11-16', 'breakfast'],
            ['2026-11-16', 'lunch']
        ]);
    });

    test('dia escolhido no seletor começa na primeira refeição publicada desse dia', () => {
        expect(
            upcomingMenuMeals(menus, '2026-11-11', { date, weekday: 2, time: '22:00' }).map(
                (meal) => meal.key
            )
        ).toEqual(['breakfast', 'lunch']);
    });
});
