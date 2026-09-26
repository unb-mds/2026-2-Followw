import { describe, expect, test } from 'bun:test';

import { campusOf, menuQueryOptions } from '#/queries/restaurant.ts';

const user = { unity: 'FCTE' };
const date = '2026-09-26';
const paramsOf = (options: ReturnType<typeof menuQueryOptions>) => options.queryKey[2];

describe('campusOf', () => {
    test('mapeia a unidade para o campus', () => {
        expect(campusOf('FCTE')).toBe('Gama');
        expect(campusOf('FCTS')).toBe('Ceilandia');
        expect(campusOf('FUP')).toBe('Planaltina');
    });

    test('cai no Darcy para outras unidades ou sem unidade', () => {
        expect(campusOf('FT')).toBe('Darcy');
        expect(campusOf(null)).toBe('Darcy');
        expect(campusOf()).toBe('Darcy');
    });
});

describe('menuQueryOptions', () => {
    test('usa o campus do usuário logado quando nenhum é especificado', () => {
        expect(paramsOf(menuQueryOptions({ date, user }))).toEqual({
            params: { query: { campus: 'Gama', date } }
        });
    });

    test('prioriza o campus explícito', () => {
        expect(paramsOf(menuQueryOptions({ campus: 'Fazenda', date, user }))).toEqual({
            params: { query: { campus: 'Fazenda', date } }
        });
    });

    test('usa o Darcy sem usuário', () => {
        expect(paramsOf(menuQueryOptions({ date, user: null }))).toEqual({
            params: { query: { campus: 'Darcy', date } }
        });
    });
});
