import { describe, expect, test } from 'bun:test';

import type { MenuSection } from '#/queries/restaurant';

import {
    cardIsExpired,
    currentOrNextMeal,
    highlightMenu,
    insufficientMealBalance
} from '#/lib/restaurant';
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

describe('insufficientMealBalance', () => {
    const now = { date: '2026-10-05', weekday: 1, time: '12:00' };

    test.each([
        [2, '08:00', 'breakfast', 2],
        [2, '09:30', 'lunch', 4.5],
        [2, '14:30', 'dinner', 4.5],
        [2, '19:30', 'breakfast', 2],
        [4, '08:00', 'breakfast', 1.5],
        [4, '09:30', 'lunch', 2.5],
        [4, '14:30', 'dinner', 2.5],
        [4, '19:30', 'breakfast', 1.5]
    ] as const)('grupo %s às %s compara o saldo com %s a R$ %s', (group, time, meal, price) => {
        const warning = insufficientMealBalance('0.00', group, { ...now, time });
        expect(warning?.meal.key).toBe(meal);
        expect(warning?.price).toBe(price);
        expect(warning?.shortfall).toBe(price);
        expect(insufficientMealBalance(price.toFixed(2), group, { ...now, time })).toBeNull();
    });

    test('calcula a diferença em centavos, inclusive para saldo negativo', () => {
        expect(insufficientMealBalance('4.49', 2, now)?.shortfall).toBe(0.01);
        expect(insufficientMealBalance('-1.00', 4, now)?.shortfall).toBe(3.5);
        expect(insufficientMealBalance('5.00', 2, now)).toBeNull();
    });

    test.each([1, 3, null, undefined])('não presume preço para o grupo %s', (group) => {
        expect(insufficientMealBalance('-10.00', group, now)).toBeNull();
    });

    test.each([null, undefined, '', 'NaN'])('não avisa sem saldo conhecido: %s', (balance) => {
        expect(insufficientMealBalance(balance, 2, now)).toBeNull();
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

function section(key: MenuSection['key'], name = key ?? 'Sem chave'): MenuSection {
    return { key, name, items: [name] };
}

describe('highlightMenu', () => {
    test('destaca o prato principal com as opções vegetarianas', () => {
        const sections = [
            section('salad_1'),
            section('main_dish'),
            section('main_dish_vegetarian'),
            section('main_dish_vegan'),
            section(null)
        ];
        const { main, alternatives, others } = highlightMenu(sections);
        expect(main?.key).toBe('main_dish');
        expect(alternatives.map((s) => s.key)).toEqual(['main_dish_vegetarian', 'main_dish_vegan']);
        expect(others.map((s) => s.key)).toEqual(['salad_1', null]);
    });

    test('no café destaca o complemento padrão', () => {
        const sections = [section('drink'), section('complement'), section('complement_vegan')];
        const { main, alternatives, others } = highlightMenu(sections);
        expect(main?.key).toBe('complement');
        expect(alternatives.map((s) => s.key)).toEqual(['complement_vegan']);
        expect(others.map((s) => s.key)).toEqual(['drink']);
    });

    test('sem prato principal nem complemento mantém tudo na lista', () => {
        const sections = [section('drink'), section('main_dish_vegan')];
        expect(highlightMenu(sections)).toEqual({ main: null, alternatives: [], others: sections });
    });
});
