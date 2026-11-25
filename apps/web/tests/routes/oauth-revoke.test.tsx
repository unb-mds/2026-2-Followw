import type { components } from '@followw/core/queries/schema.gen.ts';
import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createRootRoute,
    createRouter,
    createMemoryHistory,
    RouterProvider
} from '@tanstack/react-router';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { mockBrowserLayoutEffect } from '../helpers/base-ui';
import { useDom } from '../helpers/dom';

const dom = useDom();
let Route: typeof import('#/routes/_app/configuracoes').Route;
let restore: (() => Promise<void>) | undefined;
beforeAll(async () => {
    restore = await mockBrowserLayoutEffect();
    ({ Route } = await import('#/routes/_app/configuracoes'));
});
afterAll(async () => {
    await restore?.();
});

test('confirma revogação, permite repetir após falha e remove o acesso após sucesso', async () => {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false } }
    });
    const grant: components['schemas']['OAuthGrantView'] = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: 'flw_app_agenda',
        client_name: 'Agenda UnB',
        client_description: null,
        client_homepage_url: null,
        confidential: true,
        scopes: ['profile:read'],
        created_at: '2026-11-24T12:00:00Z',
        expires_at: '2026-12-08T12:00:00Z'
    };
    client.setQueryData(oauthGrantsQueryOptions.queryKey, [grant]);
    let attempts = 0;
    const middleware: Middleware = {
        onRequest: ({ request }) => {
            if (request.method !== 'DELETE') return Response.json([]);
            expect(new URL(request.url).pathname).toEndWith(`/oauth/grants/${grant.id}`);
            attempts++;
            return attempts === 1
                ? Response.json({ detail: 'Falha temporária' }, { status: 500 })
                : new Response(null, { status: 204 });
        }
    };
    apiClient.use(middleware);
    const router = createRouter({
        routeTree: createRootRoute({ component: Route.options.component }),
        history: createMemoryHistory({ initialEntries: ['/'] })
    });
    await router.load();
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
    try {
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Revogar acesso' }));
        const dialog = await page.findByRole('alertdialog');
        expect(attempts).toBe(0);
        await dom.testing.act(async () => {
            dom.testing.fireEvent.click(
                dom.testing.within(dialog).getByRole('button', { name: 'Revogar acesso' })
            );
        });
        expect(await page.findByText('Não foi possível revogar. Tente novamente.')).toBeTruthy();
        await dom.testing.act(async () => {
            dom.testing.fireEvent.click(
                dom.testing.within(dialog).getByRole('button', { name: 'Revogar acesso' })
            );
        });
        await dom.testing.waitFor(() =>
            expect(page.queryByText('Aplicativos autorizados')).toBeNull()
        );
        expect(attempts).toBe(2);
    } finally {
        page.unmount();
        client.clear();
        apiClient.eject(middleware);
    }
});
