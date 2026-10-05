import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/ru';

function contextWith(user, failingPath) {
    const paths = [];
    return {
        paths,
        context: {
            queryClient: {
                getQueryState: () => undefined,
                query: async ({ queryKey }) => {
                    const path = queryKey[1];
                    paths.push(path);
                    if (path === failingPath) throw new Error('SIGAA indisponível');
                    return path === '/me' ? user : [];
                }
            }
        }
    };
}

describe('loader do RU', () => {
    test('visitantes consultam apenas perfil e cardápio público', async () => {
        const context = contextWith(null);
        const data = await Route.options.loader(context);
        expect(context.paths).toEqual(['/me', '/public/restaurant']);
        expect(data.initialDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['breakfast', 'lunch', 'dinner']).toContain(data.initialMeal);
    });

    test('carrega a conta autenticada sem bloquear o cardápio quando a carteirinha falha', async () => {
        const context = contextWith({ registration: '251000000' }, '/me/ru-token');
        const data = await Route.options.loader(context);
        expect(context.paths).toEqual([
            '/me',
            '/public/restaurant',
            '/me/ru-statement',
            '/me/ru-token'
        ]);
        expect(data).toHaveProperty('initialMeal');
    });
});
