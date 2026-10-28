import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/_app/ru';

import { callRoute, fakeQueryClient, runLoader } from '../helpers/route';

function contextWith(
    user: {
        registration: string;
        unit?: { id: number; code: string | null; name: string };
    } | null,
    failingPath?: string
) {
    const paths: unknown[] = [];
    const queries: unknown[] = [];
    return {
        paths,
        queries,
        location: { searchStr: '' },
        context: {
            queryClient: fakeQueryClient((queryKey) => {
                const path = queryKey[1];
                paths.push(path);
                queries.push(queryKey[2]);
                if (path === failingPath) throw new Error('SIGAA indisponível');
                return path === '/me' ? user : [];
            })
        }
    };
}

describe('loader do RU', () => {
    test('trocar dia, refeição ou campus na página não roda o loader de novo', () => {
        expect(callRoute(Route.options.shouldReload, { cause: 'stay' })).toBe(false);
        expect(callRoute(Route.options.shouldReload, { cause: 'enter' })).toBe(true);
    });

    test('carrega o dia e o campus do link e mantém a refeição compartilhada', async () => {
        const context = contextWith({
            registration: '251000000',
            unit: { id: 672, code: 'FCTS', name: 'CAMPUS UNB CEILÂNDIA' }
        });
        const data = await runLoader(Route, {
            ...context,
            location: { searchStr: '?data=2026-10-25&refeicao=jantar&campus=Gama' }
        });
        expect(data.defaultCampus).toBe('Ceilandia');
        expect(data.defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(context.queries[1]).toMatchObject({
            params: { query: { campus: 'Gama', start_date: '2026-10-19', end_date: '2026-10-25' } }
        });
    });
    test('visitantes consultam apenas perfil e cardápio público', async () => {
        const context = contextWith(null);
        const data = await runLoader(Route, context);
        expect(context.paths).toEqual(['/me', '/public/restaurant']);
        expect(data.defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(['breakfast', 'lunch', 'dinner']).toContain(data.defaultMeal);
    });

    test('carrega a conta autenticada sem bloquear o cardápio quando a carteirinha falha', async () => {
        const context = contextWith({ registration: '251000000' }, '/me/ru-token');
        const data = await runLoader(Route, context);
        expect(context.paths).toEqual([
            '/me',
            '/public/restaurant',
            '/me/ru-statement',
            '/me/ru-token'
        ]);
        expect(data).toHaveProperty('defaultMeal');
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
