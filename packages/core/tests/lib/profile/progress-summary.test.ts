import { describe, expect, test } from 'bun:test';

import type { UserProfile } from '../../../src/queries/me.ts';

import {
    categoryForecast,
    categoryGain,
    hoursLabel,
    percentLabel,
    progressSummary
} from '../../../src/lib/profile.ts';
import { classroom } from './helpers.ts';

const user = {
    integralization: 50,
    workload: {
        total: 1000,
        pending_mandatory: 300,
        pending_optional: 200,
        pending_complementary: 0,
        mandatory: 600,
        optional: 300,
        complementary: 100
    }
} satisfies Pick<UserProfile, 'integralization' | 'workload'>;

describe('progressSummary', () => {
    test('monta as três categorias com o previsto das disciplinas atuais', () => {
        const { categories } = progressSummary(user, [
            classroom('OBR', 60, 'mandatory'),
            classroom('OPT', 30, 'optional')
        ]);
        expect(categories).toEqual([
            { label: 'Obrigatórias', pending: 300, required: 600, projected: 60 },
            { label: 'Optativas', pending: 200, required: 300, projected: 30 },
            { label: 'Complementares', pending: 0, required: 100, projected: 0 }
        ]);
    });

    test('soma o ganho de horas e arredonda o ganho percentual com uma casa', () => {
        const summary = progressSummary(user, [classroom('OBR', 60, 'mandatory')]);
        expect(summary.hoursGain).toBe(60);
        expect(summary.percentGain).toBe(6);
        expect(summary.showForecast).toBe(true);
    });

    test('o ganho para em 99,9% enquanto falta alguma hora do curso', () => {
        const almost = {
            integralization: 90,
            workload: {
                ...user.workload,
                total: 10000,
                pending_mandatory: 1000,
                pending_optional: 0,
                mandatory: 6000
            }
        };
        const { projected, percentGain } = progressSummary(almost, [
            classroom('OBR', 999, 'mandatory')
        ]);
        expect(projected).toBeCloseTo(99.99);
        expect(percentGain).toBe(9.9);
    });

    test('sem disciplinas em curso não há previsão', () => {
        const summary = progressSummary(user, []);
        expect(summary.percentGain).toBeNull();
        expect(summary.hoursGain).toBe(0);
        expect(summary.showForecast).toBe(false);
    });

    test('sem a carga do currículo não há categorias', () => {
        const summary = progressSummary({ integralization: 10, workload: null }, []);
        expect(summary.categories).toBeNull();
        expect(summary.progress).toBeNull();
    });
});

describe('categoria do currículo', () => {
    const category = { label: 'Obrigatórias', pending: 30, required: 100, projected: 60 };

    test('o ganho não passa do que falta', () => {
        expect(categoryGain(category)).toBe(30);
    });

    test('a barra prevista vai até o limite da categoria', () => {
        expect(categoryForecast(category)).toBe(100);
    });

    test('sem exigência ou sem horas previstas não há barra prevista', () => {
        expect(categoryForecast({ ...category, required: 0 })).toBeNull();
        expect(categoryForecast({ ...category, projected: 0 })).toBeNull();
    });

    test('formata horas e porcentagem em pt-BR', () => {
        expect(hoursLabel(1200)).toBe('1.200h');
        expect(percentLabel(12.6)).toBe('13%');
    });
});
