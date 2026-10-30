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
            const search = { q, type: 'optional', extra: { page: 2 } };
            expect(parseRouterSearch(stringifyRouterSearch(search))).toEqual(search);
            expect(parseRouterSearch(`?q=${encodeURIComponent(q)}`).q).toBe(q);
        }
    );

    test('restaura a query e os filtros tipados da URL', () => {
        expect(loadSearchParams('?q=calculo&type=optional')).toEqual({
            q: 'calculo',
            type: 'optional'
        });
    });

    test('filtros ausentes ou inválidos usam os padrões', () => {
        expect(loadSearchParams('?type=Eletiva')).toEqual({
            q: '',
            type: 'all'
        });
    });

    test('limpar consulta e filtros remove os parâmetros', () => {
        const serialize = createSerializer(searchParsers);
        expect(serialize({ q: '', type: 'all' })).toBe('');
        expect(serialize({ q: 'calculo', type: null })).toBe('?q=calculo');
    });

    test('o Router e o nuqs compartilham os mesmos parsers', () => {
        expect(
            validateSearch['~standard'].validate({ q: 'Carlos Silva', type: 'optional' })
        ).toEqual({
            value: { q: 'Carlos Silva', type: 'optional' }
        });
    });
});
