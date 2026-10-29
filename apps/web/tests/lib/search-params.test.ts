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
            const search = { q, tipo: 'Optativas', extra: { page: 2 } };
            expect(parseRouterSearch(stringifyRouterSearch(search))).toEqual(search);
            expect(parseRouterSearch(`?q=${encodeURIComponent(q)}`).q).toBe(q);
        }
    );

    test('restaura a query e os filtros tipados da URL', () => {
        expect(loadSearchParams('?q=calculo&tipo=Optativas')).toEqual({
            q: 'calculo',
            tipo: 'Optativas'
        });
    });

    test('filtros ausentes ou inválidos usam os padrões', () => {
        expect(loadSearchParams('?tipo=Eletiva')).toEqual({
            q: '',
            tipo: 'Todas'
        });
    });

    test('limpar consulta e filtros remove os parâmetros', () => {
        const serialize = createSerializer(searchParsers);
        expect(serialize({ q: '', tipo: 'Todas' })).toBe('');
        expect(serialize({ q: 'calculo', tipo: null })).toBe('?q=calculo');
    });

    test('o Router e o nuqs compartilham os mesmos parsers', () => {
        expect(
            validateSearch['~standard'].validate({ q: 'Carlos Silva', tipo: 'Optativas' })
        ).toEqual({
            value: { q: 'Carlos Silva', tipo: 'Optativas' }
        });
    });
});
