import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/buscar';

const loadWith = async (user) => {
    const keys = [];
    await Route.options.loader({
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
});
