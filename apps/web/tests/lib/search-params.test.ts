import { describe, expect, test } from 'bun:test';
import { createSerializer } from 'nuqs/server';

import {
    loadSearchParams,
    parseRouterSearch,
    searchParsers,
    stringifyRouterSearch,
    validateSearch
} from '#/lib/search-params';

describe('parâmetros da busca', () => {
    test.each(['001', '1234567890123456789012345', '"Carlos"', '[1,2]', 'null'])(
        'o Router preserva a consulta textual %s sem conversão JSON',
        (q) => {
            const search = { q, category: 'courses', extra: { page: 2 } };
            expect(parseRouterSearch(stringifyRouterSearch(search))).toEqual(search);
            expect(parseRouterSearch(`?q=${encodeURIComponent(q)}`).q).toBe(q);
        }
    );

    test('restaura a query e os filtros tipados da URL', () => {
        expect(loadSearchParams('?q=calculo&category=courses')).toEqual({
            hideConflicts: false,
            hideUnavailable: false,
            kind: [],
            days: '',
            start: [],
            hours: [],
            q: 'calculo',
            category: 'courses'
        });
    });

    test('filtros ausentes ou inválidos usam os padrões', () => {
        expect(loadSearchParams('?category=Eletiva')).toEqual({
            hideConflicts: false,
            hideUnavailable: false,
            kind: [],
            days: '',
            start: [],
            hours: [],
            q: '',
            category: 'all'
        });
    });

    test('restaura seleções múltiplas de horas e horários pela URL', () => {
        const filters = {
            hours: [60, '90+' as const],
            start: ['08:00', '10:00'],
            kind: ['mandatory' as const, 'free' as const]
        };
        const url = createSerializer(searchParsers)(filters);
        expect(loadSearchParams(url)).toMatchObject(filters);
        expect(validateSearch['~standard'].validate(parseRouterSearch(url))).toEqual({
            value: filters
        });
        expect(validateSearch['~standard'].validate(parseRouterSearch('?hours=60'))).toEqual({
            value: { hours: [60] }
        });
    });

    test('carga horária aceita só as opções exatas abaixo de 90h e 90+', () => {
        expect(loadSearchParams('?hours=60&hours=90&hours=105&hours=90%2B&hours=x').hours).toEqual([
            60,
            '90+'
        ]);
    });

    test('limpar consulta e filtros remove os parâmetros', () => {
        const serialize = createSerializer(searchParsers);
        expect(serialize({ q: '', category: 'all' })).toBe('');
        expect(serialize({ q: 'calculo', category: null })).toBe('?q=calculo');
    });

    test('o Router e o nuqs compartilham os mesmos parsers', () => {
        expect(
            validateSearch['~standard'].validate({ q: 'Carlos Silva', category: 'courses' })
        ).toEqual({
            value: { q: 'Carlos Silva', category: 'courses' }
        });
    });

    test('tipos inválidos na URL são descartados', () => {
        expect(loadSearchParams('?kind=optional&kind=eletiva&kind=free').kind).toEqual([
            'optional',
            'free'
        ]);
    });
});

describe('dias da semana na URL', () => {
    test('ignora dias inválidos e organiza os válidos', () => {
        expect(loadSearchParams('?days=abc').days).toBe('');
        expect(loadSearchParams('?days=99').days).toBe('');
        expect(loadSearchParams('?days=4220').days).toBe('024');
    });
});
