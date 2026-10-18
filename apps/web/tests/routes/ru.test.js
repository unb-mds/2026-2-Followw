import { describe, expect, test } from 'bun:test';

import { Route } from '#/routes/_app/ru';

function contextWith(user, failingPath) {
    const paths = [];
    const queries = [];
    return {
        paths,
        queries,
        location: { searchStr: '' },
        context: {
            queryClient: {
                getQueryData: () => undefined,
                query: async ({ queryKey }) => {
                    const path = queryKey[1];
                    paths.push(path);
                    queries.push(queryKey[2]);
                    if (path === failingPath) throw new Error('SIGAA indisponível');
                    return path === '/me' ? user : [];
                }
            }
        }
    };
}

describe('loader do RU', () => {
    test('trocar dia, refeição ou campus na página não roda o loader de novo', () => {
        expect(Route.options.shouldReload({ cause: 'stay' })).toBe(false);
        expect(Route.options.shouldReload({ cause: 'enter' })).toBe(true);
    });

    test('carrega o dia e o campus do link e mantém a refeição compartilhada', async () => {
        const context = contextWith({ registration: '251000000', unity: 'FCTS' });
        const data = await Route.options.loader({
            ...context,
            location: { searchStr: '?date=2026-10-25&meal=dinner&campus=Gama' }
        });
        expect(data.defaultCampus).toBe('Ceilandia');
        expect(data.defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(context.queries[1]).toMatchObject({
            params: { query: { campus: 'Gama', start_date: '2026-10-19', end_date: '2026-10-25' } }
        });
    });
    test('visitantes consultam apenas perfil e cardápio público', async () => {
        const context = contextWith(null);
        const data = await Route.options.loader(context);
        expect(context.paths).toEqual(['/me', '/public/restaurant']);
        expect(data.defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['breakfast', 'lunch', 'dinner']).toContain(data.defaultMeal);
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
        expect(data).toHaveProperty('defaultMeal');
    });
});
