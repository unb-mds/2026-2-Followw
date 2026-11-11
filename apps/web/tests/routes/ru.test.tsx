import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { describe, expect, test } from 'bun:test';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { renderToStaticMarkup } from 'react-dom/server';

import { PageStateProvider } from '#/components/PageState';
import { loadRestaurantSearch, validateRestaurantSearch } from '#/lib/restaurant-share';
import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/_app/ru';
import { routeTree } from '#/routeTree.gen';

import { callRoute, fakeQueryClient, runLoader } from '../helpers/route';

function contextWith(
    user: {
        registration: string;
        unit?: { id: number; code: string | null; name: string };
    } | null,
    failingPath?: string,
    published = false
) {
    const paths: unknown[] = [];
    const queries: unknown[] = [];
    return {
        paths,
        queries,
        deps: {},
        context: {
            queryClient: fakeQueryClient((queryKey) => {
                const path = queryKey[1];
                paths.push(path);
                queries.push(queryKey[2]);
                if (path === failingPath) throw new Error('SIGAA indisponível');
                if (path === '/me') return user;
                return published && path === '/public/restaurant'
                    ? [
                          {
                              date: '2026-10-25',
                              dinner: [{ items: ['Sopa'] }],
                              lunch: [{ items: ['Arroz'] }]
                          }
                      ]
                    : [];
            })
        }
    };
}

describe('loader do RU', () => {
    test.each(['2030-02-30', 'abc'])(
        'ignora a data inválida %s e consulta o cardápio atual',
        async (date) => {
            const context = contextWith(null);
            const location = { searchStr: `?date=${date}` };
            expect(loadRestaurantSearch(location.searchStr).date).toBeNull();
            expect(validateRestaurantSearch({ date })).toEqual({
                date: undefined,
                meal: undefined,
                campus: undefined
            });
            const data = await runLoader(Route, {
                ...context,
                deps: validateRestaurantSearch({ date })
            });
            expect(data.selection.date).toBe(data.defaults.date);
            expect(context.queries[1]).toMatchObject({
                params: { query: { start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) } }
            });
        }
    );

    test.each([
        ['2030-01-01', false, 'noindex, follow'],
        ['2026-10-25', true, 'index, follow']
    ] as const)(
        'mantém a prévia de %s e decide a indexação pela refeição publicada',
        async (date, published, robots) => {
            const search = { date, meal: 'dinner', campus: 'Gama' };
            const searchStr = `?${new URLSearchParams(search)}`;
            const loaderData = await runLoader(Route, {
                ...contextWith(null, undefined, published),
                deps: search
            });
            const head = await callRoute(Route.options.head, { loaderData });
            expect(head?.meta).toContainEqual({ name: 'robots', content: robots });
            expect(head?.links).toContainEqual({
                rel: 'canonical',
                href: `https://followw.app/ru${searchStr}`
            });
            expect(head?.meta).toContainEqual({
                property: 'og:url',
                content: `https://followw.app/ru${searchStr}`
            });
        }
    );

    test('trocar a refeição atualiza a indexação conforme o cardápio publicado', async () => {
        const router = createRouter({
            routeTree,
            context: contextWith(null, undefined, true).context,
            history: createMemoryHistory({
                initialEntries: ['/ru?campus=Gama&meal=dinner&date=2026-10-25&theme=dark']
            }),
            origin: 'https://followw.app',
            isServer: false
        });
        await router.load();
        const robots = () => router.state.matches.at(-1)?.meta;
        expect(robots()).toContainEqual({ name: 'robots', content: 'index, follow' });
        expect(router.state.matches.at(-1)?.links).toContainEqual({
            rel: 'canonical',
            href: 'https://followw.app/ru?date=2026-10-25&meal=dinner&campus=Gama'
        });
        await router.navigate({
            to: '/ru',
            search: { date: '2026-10-25', meal: 'lunch', campus: 'Gama' }
        });
        expect(robots()).toContainEqual({ name: 'robots', content: 'index, follow' });
        await router.navigate({
            to: '/ru',
            search: { date: '2030-01-01', meal: 'lunch', campus: 'Gama' }
        });
        expect(robots()).toContainEqual({ name: 'robots', content: 'noindex, follow' });
    });

    test('carrega o dia e o campus do link e mantém a refeição compartilhada', async () => {
        const context = contextWith({
            registration: '251000000',
            unit: { id: 672, code: 'FCTS', name: 'CAMPUS UNB CEILÂNDIA' }
        });
        const data = await runLoader(Route, {
            ...context,
            deps: { date: '2026-10-25', meal: 'dinner', campus: 'Gama' }
        });
        expect(data.defaults.campus).toBe('Ceilandia');
        expect(data.selection).toEqual({ date: '2026-10-25', meal: 'dinner', campus: 'Gama' });
        expect(context.queries[1]).toMatchObject({
            params: { query: { campus: 'Gama', start_date: '2026-10-19', end_date: '2026-10-25' } }
        });
    });
    test('visitantes consultam apenas perfil e cardápio público', async () => {
        const context = contextWith(null);
        const data = await runLoader(Route, context);
        expect(context.paths).toEqual(['/me', '/public/restaurant']);
        expect(data.defaults.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['breakfast', 'lunch', 'dinner']).toContain(data.defaults.meal);
    });

    test('no SSR não consulta a conta, que fica para o cache do navegador', async () => {
        const context = contextWith({ registration: '251000000' });
        await runLoader(Route, context);
        expect(context.paths).toEqual(['/me', '/public/restaurant']);
    });

    test('carrega a conta autenticada sem bloquear o cardápio quando a carteirinha falha', async () => {
        const context = contextWith({ registration: '251000000' }, '/me/ru-token');
        environmentManager.setIsServer(() => false);
        const data = await runLoader(Route, context).finally(() =>
            environmentManager.setIsServer(() => true)
        );
        expect(context.paths).toEqual([
            '/me',
            '/public/restaurant',
            '/me/ru-statement',
            '/me/ru-token'
        ]);
        expect(data).toHaveProperty('defaults.meal');
    });
});

test('header do RU renderiza enquanto o loader ainda carrega', async () => {
    const Header = Route.options.staticData?.header;
    if (!Header) throw new Error('Header do RU ausente');
    const root = createRootRoute();
    const app = createRoute({
        getParentRoute: () => root,
        id: '_app',
        component: () => (
            <PageStateProvider page="/ru">
                <Header />
                <Outlet />
            </PageStateProvider>
        )
    });
    const ru = createRoute({
        getParentRoute: () => app,
        path: 'ru',
        loader: () => new Promise<never>(() => {})
    });
    const router = createRouter({
        routeTree: root.addChildren([app.addChildren([ru])]),
        history: createMemoryHistory({ initialEntries: ['/ru'] }),
        isServer: false,
        origin: 'http://localhost',
        defaultPendingMs: 0,
        defaultPendingComponent: () => null
    });
    void router.load();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const match = router.state.matches.at(-1);
    expect(match?.status).toBe('pending');
    expect(match?.loaderData).toBeUndefined();

    const client = new QueryClient();
    client.setQueryData(meQueryOptions.queryKey, null);
    const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <NuqsTestingAdapter>
                <RouterProvider router={router} />
            </NuqsTestingAdapter>
        </QueryClientProvider>
    );
    expect(html).toContain('Cardápio');
});
