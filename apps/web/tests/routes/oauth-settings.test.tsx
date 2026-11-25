import type { components } from '@followw/core/queries/schema.gen.ts';

import { oauthGrantsQueryOptions } from '@followw/core/queries/oauth.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Route } from '#/routes/_app/configuracoes';

import { fakeQueryClient, runLoader } from '../helpers/route';

test('preserva configurações no retorno do login', async () => {
    expect(
        runLoader(Route, {
            context: { queryClient: fakeQueryClient(() => null) },
            location: { href: '/configuracoes' }
        })
    ).rejects.toMatchObject({ options: { to: '/login', search: { returnTo: '/configuracoes' } } });
});

async function renderSettings(client: QueryClient) {
    const router = createRouter({
        routeTree: createRootRoute({ component: Route.options.component }),
        history: createMemoryHistory({ initialEntries: ['/'] })
    });
    await router.load();
    return renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
}

async function failRefresh(client: QueryClient) {
    await client
        .query({
            ...oauthGrantsQueryOptions,
            staleTime: 0,
            retry: false,
            queryFn: () => {
                throw new Error('Falha temporária');
            }
        })
        .catch(() => undefined);
}

test.each([false, true])(
    'mostra a seção vazia e sem aviso quando não há acessos, mesmo após falha (%s)',
    async (failed) => {
        const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
        client.setQueryData(oauthGrantsQueryOptions.queryKey, []);
        if (failed) await failRefresh(client);
        const html = await renderSettings(client);
        expect(html).toContain('Aparência');
        expect(html).toContain('Portal de desenvolvedores');
        expect(html).not.toContain('Voltar ao perfil');
        expect(html).toContain('Apps conectados');
        expect(html).toContain('Nenhum app conectado');
        expect(html).not.toContain('Não foi possível atualizar seus acessos');
        expect(html).not.toContain('Tentar novamente');
        client.clear();
    }
);

test('mantém o aviso de falha quando há acessos na tela', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const grant: components['schemas']['OAuthGrantView'] = {
        id: '11111111-1111-4111-8111-111111111111',
        client_id: 'flw_app_agenda',
        client_name: 'Agenda UnB',
        client_description: null,
        client_homepage_url: null,
        confidential: true,
        scopes: ['profile:read'],
        created_at: '2026-11-24T12:00:00Z',
        last_access_at: '2026-11-25T12:00:00Z',
        expires_at: '2026-12-08T12:00:00Z'
    };
    client.setQueryData(oauthGrantsQueryOptions.queryKey, [grant]);
    await failRefresh(client);
    const html = await renderSettings(client);
    expect(html).toContain('Apps conectados');
    expect(html).toContain('Agenda UnB');
    expect(html).toContain('Não foi possível atualizar seus acessos');
    expect(html).toContain('Tentar novamente');
    client.clear();
});
