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
        (busca) => {
            const search = { busca, tipo: 'Optativas', extra: { page: 2 } };
            expect(parseRouterSearch(stringifyRouterSearch(search))).toEqual(search);
            expect(parseRouterSearch(`?busca=${encodeURIComponent(busca)}`).busca).toBe(busca);
        }
    );

    test('restaura a query e os filtros tipados da URL', () => {
        expect(loadSearchParams('?busca=calculo&tipo=Optativas')).toEqual({
            busca: 'calculo',
            tipo: 'Optativas'
        });
    });

    test('filtros ausentes ou inválidos usam os padrões', () => {
        expect(loadSearchParams('?tipo=Eletiva')).toEqual({
            busca: '',
            tipo: 'Todas'
        });
    });

    test('limpar consulta e filtros remove os parâmetros', () => {
        const serialize = createSerializer(searchParsers);
        expect(serialize({ busca: '', tipo: 'Todas' })).toBe('');
        expect(serialize({ busca: 'calculo', tipo: null })).toBe('?busca=calculo');
    });

    test('o Router e o nuqs compartilham os mesmos parsers', () => {
        expect(
            validateSearch['~standard'].validate({ busca: 'Carlos Silva', tipo: 'Optativas' })
        ).toEqual({
            value: { busca: 'Carlos Silva', tipo: 'Optativas' }
        });
    });
});
