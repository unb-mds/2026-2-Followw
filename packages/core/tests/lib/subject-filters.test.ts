import { describe, expect, test } from 'bun:test';

import {
    emptySubjectFilters,
    hasSubjectFilters,
    kindsTitle,
    resultsSummary,
    subjectsQueryFrom
} from '../../src/lib/subject-filters.ts';

describe('consulta de matérias pelos filtros', () => {
    test('sem filtro que restrinja a oferta não há consulta própria', () => {
        expect(
            subjectsQueryFrom({ ...emptySubjectFilters, hideUnavailable: true }, 'calculo')
        ).toBeNull();
        expect(hasSubjectFilters(emptySubjectFilters)).toBe(false);
        expect(hasSubjectFilters({ ...emptySubjectFilters, hideConflicts: true })).toBe(true);
    });

    test('expande o bloco de início e repassa disponibilidade e tipos', () => {
        const filters = {
            ...emptySubjectFilters,
            start: ['08:00'],
            kind: ['free' as const],
            hideUnavailable: true,
            days: '02'
        };
        expect(subjectsQueryFrom(filters, 'calculo')).toEqual({
            q: 'calculo',
            offered: true,
            available: true,
            kind: ['free'],
            days: '02',
            start: ['08:00', '08:55']
        });
    });

    test('título segue a ordem da matriz', () => {
        expect(kindsTitle(['free', 'mandatory'])).toBe('Obrigatórias e Livres');
        expect(kindsTitle([])).toBe('Matérias');
    });

    test('consulta da unidade existe mesmo sem filtros', () => {
        expect(subjectsQueryFrom(emptySubjectFilters, null, 'FCTE')).toEqual({
            unit: 'FCTE',
            offered: true
        });
    });
});

describe('resultsSummary', () => {
    test('conta os resultados e as matérias ocultas por conflito', () => {
        expect(resultsSummary(1, 0)).toBe('1 resultado');
        expect(resultsSummary(12, 2)).toBe('12 resultados · 2 ocultas por conflito');
    });
});
