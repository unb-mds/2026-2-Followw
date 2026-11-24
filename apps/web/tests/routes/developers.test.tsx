import type { OAuthClient } from '@followw/core/queries/oauth.ts';
import type { components } from '@followw/core/queries/schema.gen.ts';

import { oauthClientsQueryOptions } from '@followw/core/queries/oauth.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';

import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/developers';

import { fakeQueryClient, runLoader } from '../helpers/route';

const user: components['schemas']['UserProfile'] = {
    name: 'Dev UnB',
    registration: '202600001',
    photo: null,
    bio: null,
    unit: null,
    course: null,
    entry_semester: null,
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

test('redireciona para /login quando não autenticado', async () => {
    const queryClient = fakeQueryClient(() => null);
    let thrown: unknown;
    try {
        await runLoader(Route, { context: { queryClient } });
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toMatchObject({ options: { to: '/login' } });
});

test('exibe estado vazio quando o desenvolvedor ainda não possui aplicações', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(meQueryOptions.queryKey, user);
    client.setQueryData(oauthClientsQueryOptions.queryKey, []);

    const router = createRouter({
        routeTree: createRootRoute({ component: Route.options.component }),
        history: createMemoryHistory({ initialEntries: ['/'] })
    });
    await router.load();
    const browser = new Window();
    try {
        browser.document.body.innerHTML = renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );
        expect(browser.document.body.textContent).toContain('Portal de Desenvolvedores');
        expect(browser.document.body.textContent).toContain('Nenhuma aplicação cadastrada');
    } finally {
        browser.close();
    }
});

test('lista aplicações públicas e confidenciais com ações adequadas', async () => {
    const apps: OAuthClient[] = [
        {
            id: 'flw_app_confidencial',
            name: 'Bot UnB',
            description: 'Notifica avisos no Telegram',
            homepage_url: 'https://bot.unb.dev',
            confidential: true,
            redirect_uris: ['https://bot.unb.dev/callback'],
            created_at: '2026-11-24T00:00:00Z',
            updated_at: '2026-11-24T00:00:00Z'
        },
        {
            id: 'flw_app_publico',
            name: 'App Mobile',
            description: null,
            homepage_url: null,
            confidential: false,
            redirect_uris: ['meuapp://callback'],
            created_at: '2026-11-24T00:00:00Z',
            updated_at: '2026-11-24T00:00:00Z'
        }
    ];
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(meQueryOptions.queryKey, user);
    client.setQueryData(oauthClientsQueryOptions.queryKey, apps);

    const router = createRouter({
        routeTree: createRootRoute({ component: Route.options.component }),
        history: createMemoryHistory({ initialEntries: ['/'] })
    });
    await router.load();
    const browser = new Window();
    try {
        browser.document.body.innerHTML = renderToStaticMarkup(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );
        const cards = [...browser.document.querySelectorAll('[data-slot="card"]')];
        expect(cards).toHaveLength(2);
        expect(cards[0]?.textContent).toContain('Bot UnB');
        expect(cards[0]?.textContent).toContain('Confidencial');
        expect(cards[0]?.textContent).toContain('flw_app_confidencial');
        expect(cards[0]?.querySelector('[aria-label="Ações de Bot UnB"]')).not.toBeNull();

        expect(cards[1]?.textContent).toContain('App Mobile');
        expect(cards[1]?.textContent).toContain('Pública');
        expect(cards[1]?.textContent).toContain('meuapp://callback');
        expect(cards[1]?.querySelector('[aria-label="Ações de App Mobile"]')).not.toBeNull();
    } finally {
        browser.close();
    }
});
