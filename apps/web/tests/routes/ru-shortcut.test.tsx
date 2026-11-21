import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { credentialsQueryOptions } from '@followw/core/queries/restaurant-account.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRouteWithContext,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider
} from '@tanstack/react-router';
import { expect, mock, test } from 'bun:test';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useLayoutEffect } from 'react';

import { BottomNavigation } from '#/components/BottomNavigation';
import { PageStateProvider } from '#/components/PageState';
import { meQueryOptions, type UserProfile } from '#/queries/me';
import { Route } from '#/routes/_app/ru';

import { useDom } from '../helpers/dom';
import { runLoader } from '../helpers/route';

const dom = useDom();

test('dois cliques no RU abrem o QR salvo enquanto o cardápio carrega', async () => {
    const registration = '251000000';
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const user: UserProfile = {
        registration,
        name: 'Nome SIGAA',
        photo: null,
        bio: null,
        course: null,
        unit: null,
        entry_semester: null,
        integralization: null,
        workload: null,
        period_max_workload: null,
        ira: null,
        mp: null,
        level: 'Graduação'
    };
    client.setQueryData(meQueryOptions.queryKey, user);
    client.setQueryData(credentialsQueryOptions(registration).queryKey, {
        token: 'qr-do-teste',
        valid_until: '2099-12-01'
    });
    const menu = Promise.withResolvers<Response>();
    const requests: string[] = [];
    const middleware: Middleware = {
        onRequest: ({ request }) => {
            const { pathname } = new URL(request.url);
            requests.push(pathname);
            if (pathname === '/api/public/restaurant') return menu.promise;
            return Response.json({ balance: '12.50', group: 2, entries: [] });
        }
    };
    const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
        component: () => (
            <PageStateProvider page="/ru">
                <BottomNavigation />
                <Outlet />
            </PageStateProvider>
        )
    });
    const app = createRoute({ getParentRoute: () => root, id: '_app' });
    const home = createRoute({ getParentRoute: () => app, path: '/' });
    const ru = createRoute({
        getParentRoute: () => app,
        path: 'ru',
        validateSearch: Route.options.validateSearch,
        shouldReload: ({ cause }) => cause !== 'stay',
        loader: (context) => runLoader(Route, context),
        component: Route.options.component
    });
    const router = createRouter({
        routeTree: root.addChildren([app.addChildren([home, ru])]),
        context: { queryClient: client },
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: false,
        origin: 'http://localhost'
    });
    const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
    await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
        useIsoLayoutEffect: useLayoutEffect
    }));
    apiClient.use(middleware);
    try {
        await router.load();
        const view = dom.testing.render(
            <QueryClientProvider client={client}>
                <NuqsTestingAdapter>
                    <RouterProvider router={router} />
                </NuqsTestingAdapter>
            </QueryClientProvider>
        );
        const link = view.getByRole('link', { name: 'RU' });
        dom.testing.fireEvent.click(link);
        dom.testing.fireEvent.click(link);

        const dialog = await view.findByRole('dialog', { name: 'Carteirinha estudantil' });
        expect(dialog.querySelector('svg title')?.textContent).toBe(
            'QR code da carteirinha estudantil'
        );
        expect(requests).toContain('/api/public/restaurant');
        expect(requests).not.toContain('/api/me/ru-token');
    } finally {
        dom.testing.cleanup();
        menu.resolve(Response.json([]));
        client.clear();
        apiClient.eject(middleware);
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
    }
});
