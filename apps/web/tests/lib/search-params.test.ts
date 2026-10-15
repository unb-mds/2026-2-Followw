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
            const search = { q, turno: 'Noite', extra: { page: 2 } };
            expect(parseRouterSearch(stringifyRouterSearch(search))).toEqual(search);
            expect(parseRouterSearch(`?q=${encodeURIComponent(q)}`).q).toBe(q);
        }
    );

    test('restaura a query e os filtros tipados da URL', () => {
        expect(loadSearchParams('?q=calculo&turno=Noite&disponibilidade=Disponíveis')).toEqual({
            q: 'calculo',
            turno: 'Noite',
            disponibilidade: 'Disponíveis'
        });
    });

    test('filtros ausentes ou inválidos usam os padrões', () => {
        expect(loadSearchParams('?turno=Madrugada&disponibilidade=Talvez')).toEqual({
            q: '',
            turno: 'Todos',
            disponibilidade: 'Todas'
        });
    });

    test('limpar consulta e filtros remove os parâmetros', () => {
        const serialize = createSerializer(searchParsers);
        expect(serialize({ q: '', turno: 'Todos', disponibilidade: 'Todas' })).toBe('');
        expect(serialize({ q: 'calculo', turno: 'Todos', disponibilidade: null })).toBe(
            '?q=calculo'
        );
    });

    test('o Router e o nuqs compartilham os mesmos parsers', () => {
        expect(validateSearch['~standard'].validate({ q: 'Carlos Silva', turno: 'Noite' })).toEqual(
            {
                value: { q: 'Carlos Silva', turno: 'Noite' }
            }
        );
    });
});
