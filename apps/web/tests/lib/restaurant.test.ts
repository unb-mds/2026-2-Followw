import { describe, expect, test } from 'bun:test';

import { cardIsExpired, currentOrNextMeal } from '#/lib/restaurant';
import { nowInBrasilia } from '#/lib/schedule';

describe('currentOrNextMeal', () => {
    test.each([
        ['06:00', 'breakfast'],
        ['07:00', 'breakfast'],
        ['08:00', 'breakfast'],
        ['09:29', 'breakfast'],
        ['09:30', 'lunch'],
        ['10:30', 'lunch'],
        ['11:00', 'lunch'],
        ['14:29', 'lunch'],
        ['14:30', 'dinner'],
        ['17:00', 'dinner'],
        ['19:29', 'dinner']
    ] as const)('às %s seleciona %s', (time, meal) => {
        const selected = currentOrNextMeal({ date: '2026-10-05', weekday: 1, time });
        expect(selected.meal.key).toBe(meal);
        expect(selected.date).toBe('2026-10-05');
    });

    test.each(['19:30', '23:59'])('após o jantar mostra café do dia seguinte às %s', (time) => {
        const selected = currentOrNextMeal({ date: '2026-12-31', weekday: 4, time });
        expect(selected.meal.key).toBe('breakfast');
        expect(selected.date).toBe('2027-01-01');
    });

    test('usa o horário de Brasília, independentemente do fuso do navegador', () => {
        const selected = currentOrNextMeal(nowInBrasilia(new Date('2026-10-05T12:29:00Z')));
        expect(selected.meal.key).toBe('breakfast');
    });
});

describe('cardIsExpired', () => {
    test('a validade inclui todo o mês informado pelo SIGAA', () => {
        expect(cardIsExpired('2026-10-01', '2026-10-01')).toBe(false);
        expect(cardIsExpired('2026-10-01', '2026-10-31')).toBe(false);
        expect(cardIsExpired('2026-10-01', '2026-11-01')).toBe(true);
        expect(cardIsExpired('2026-12-01', '2027-01-01')).toBe(true);
    });
});
