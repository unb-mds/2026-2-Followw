import type { QueryKey } from '@tanstack/react-query';

import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/buscar';

import { callRoute, fakeQueryClient, runLoader } from '../helpers/route';

interface User {
    registration: string;
    unit: { id: number; code: string | null; name: string };
    level?: string;
}

const loadWith = async (user: User | null, searchStr = '') => {
    const keys: QueryKey[] = [];
    await runLoader(Route, {
        location: { searchStr },
        context: {
            queryClient: fakeQueryClient((queryKey) => {
                keys.push(queryKey);
                return queryKey[1] === '/me' ? user : [];
            })
        }
    });
    return keys;
};

describe('loader da busca de turmas', () => {
    test('sem login carrega só o perfil', async () => {
        expect((await loadWith(null)).map((key) => key[1])).toEqual(['/me']);
    });

    test('com login pré-carrega o histórico e as matérias da unidade', async () => {
        const keys = await loadWith({
            registration: '1',
            unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' }
        });
        expect(keys.map((key) => key[1])).toEqual(['/me', '/classrooms', '/public/subjects']);
        expect(keys[2][2]).toEqual({ params: { query: { unit: 'FCTE' } } });
    });

    test.each([
        null,
        { registration: '1', unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' } }
    ])('uma URL direta pré-carrega a pesquisa, com perfil %p', async (user) => {
        const keys = await loadWith(user, '?q=calculo');
        const subjects = keys.find((key) => key[1] === '/public/subjects');
        expect(subjects?.[2]).toEqual({ params: { query: { q: 'calculo' } } });
    });

    test.each(['ab', 'a'.repeat(33)])('query inválida %s pré-carrega a unidade', async (q) => {
        const keys = await loadWith(
            { registration: '1', unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' } },
            `?q=${q}`
        );
        const subjects = keys.filter((key) => key[1] === '/public/subjects');
        expect(subjects.map((key) => key[2])).toEqual([{ params: { query: { unit: 'FCTE' } } }]);
        expect((await loadWith(null, `?q=${q}`)).map((key) => key[1])).toEqual(['/me']);
    });

    test('mudanças na URL deixam a busca para o debounce do componente', () => {
        expect(callRoute(Route.options.shouldReload, { cause: 'stay' })).toBe(false);
        expect(callRoute(Route.options.shouldReload, { cause: 'enter' })).toBe(true);
    });
});

describe('recomendações somente na busca', () => {
    const student = {
        registration: '1',
        unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
        level: 'Graduação'
    };
    test('graduação sem texto e filtros carrega recomendações em vez da lista da unidade', async () => {
        const keys = await loadWith(student);
        expect(keys.map((key) => key[1])).toEqual(['/me', '/classrooms', '/public/subjects']);
        expect(keys[2][2]).toEqual({});
    });
    test('pesquisa mantém a busca padrão', async () => {
        const subjects = (await loadWith(student, '?q=calculo')).filter(
            (key) => key[1] === '/public/subjects'
        );
        expect(subjects).toHaveLength(1);
        expect(subjects[0][2]).toHaveProperty('params.query');
    });
    test('visitante não carrega recomendações', async () => {
        expect((await loadWith(null)).map((key) => key[1])).toEqual(['/me']);
    });
});
