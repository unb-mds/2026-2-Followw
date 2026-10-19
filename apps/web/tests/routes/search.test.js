import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/buscar';

const loadWith = async (user, searchStr = '') => {
    const keys = [];
    await Route.options.loader({
        location: { searchStr },
        context: {
            queryClient: {
                getQueryData: () => undefined,
                query: async ({ queryKey }) => {
                    keys.push(queryKey);
                    return queryKey[1] === '/me' ? user : [];
                }
            }
        }
    });
    return keys;
};

describe('loader da busca de turmas', () => {
    test('sem login carrega só o perfil', async () => {
        expect((await loadWith(null)).map((key) => key[1])).toEqual(['/me']);
    });

    test('com login pré-carrega o histórico e as matérias da unidade', async () => {
        const keys = await loadWith({ registration: '1', unity: 'FCTE' });
        expect(keys.map((key) => key[1])).toEqual(['/me', '/classrooms', '/public/subjects']);
        expect(keys[2][2]).toEqual({ params: { query: { unit: 'FCTE' } } });
    });

    test.each([null, { registration: '1', unity: 'FCTE' }])(
        'uma URL direta pré-carrega a pesquisa, com perfil %p',
        async (user) => {
            const keys = await loadWith(user, '?q=calculo&turno=Noite');
            const subjects = keys.find((key) => key[1] === '/public/subjects');
            expect(subjects[2]).toEqual({ params: { query: { q: 'calculo' } } });
        }
    );

    test.each(['ab', 'a'.repeat(91)])('query inválida %s pré-carrega a unidade', async (q) => {
        const keys = await loadWith({ registration: '1', unity: 'FCTE' }, `?q=${q}`);
        const subjects = keys.filter((key) => key[1] === '/public/subjects');
        expect(subjects.map((key) => key[2])).toEqual([{ params: { query: { unit: 'FCTE' } } }]);
        expect((await loadWith(null, `?q=${q}`)).map((key) => key[1])).toEqual(['/me']);
    });

    test('mudanças na URL deixam a busca para o debounce do componente', () => {
        expect(Route.options.shouldReload({ cause: 'stay' })).toBe(false);
        expect(Route.options.shouldReload({ cause: 'enter' })).toBe(true);
    });
});

describe('recomendações somente na busca', () => {
    const student = { registration: '1', unity: 'FCTE', level: 'Graduação' };
    test('graduação sem texto e filtros carrega recomendações em vez da lista da unidade', async () => {
        const keys = await loadWith(student);
        expect(keys.map((key) => key[1])).toEqual(['/me', '/classrooms', '/public/subjects']);
        expect(keys[2][2]).toEqual({});
    });
    test.each(['?q=calculo', '?turno=Noite', '?disponibilidade=Disponíveis'])(
        'pesquisa ou filtro %s mantém a busca padrão',
        async (search) => {
            const subjects = (await loadWith(student, search)).filter(
                (key) => key[1] === '/public/subjects'
            );
            expect(subjects).toHaveLength(1);
            expect(subjects[0][2]).toHaveProperty('params.query');
        }
    );
    test('visitante não carrega recomendações', async () => {
        expect((await loadWith(null)).map((key) => key[1])).toEqual(['/me']);
    });
});
