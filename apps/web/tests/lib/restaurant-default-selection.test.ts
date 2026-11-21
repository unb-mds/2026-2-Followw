import { describe, expect, test } from 'bun:test';

import type { RestaurantSelection } from '#/lib/restaurant-share';

import { isDefaultSelection } from '#/lib/restaurant-share';

const defaults: RestaurantSelection = { date: '2026-10-19', meal: 'lunch', campus: 'Gama' };

describe('cardápio padrão do RU', () => {
    test('a seleção igual ao padrão é o cardápio atual', () => {
        expect(isDefaultSelection({ ...defaults }, defaults)).toBe(true);
    });

    test.each([
        ['outro dia', { date: '2026-10-20' }],
        ['outra refeição no mesmo dia', { meal: 'dinner' }],
        ['outro campus no mesmo dia', { campus: 'Darcy' }]
    ] as const)('%s não é o cardápio atual', (_, change) => {
        expect(isDefaultSelection({ ...defaults, ...change }, defaults)).toBe(false);
    });
});
