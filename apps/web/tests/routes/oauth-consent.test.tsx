import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createRootRoute,
    createRouter,
    createMemoryHistory,
    RouterProvider
} from '@tanstack/react-router';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';
import { Route } from '#/routes/autorizar';

import { useDom } from '../helpers/dom';
import { fakeQueryClient, runLoader } from '../helpers/route';

const dom = useDom('http://localhost/autorizar');
let client: QueryClient;
let middleware: Middleware;
let decisions: unknown[];
const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'flw_app_agenda',
    redirect_uri: 'https://agenda.test/callback',
    scope: 'profile:read',
    code_challenge: 'a'.repeat(43),
    code_challenge_method: 'S256',
    state: '000123'
});

beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    decisions = [];
    middleware = {
        onRequest: async ({ request }) => {
            if (request.method === 'POST') {
                decisions.push(await request.json());
                return Response.json({ error: 'invalid_request' }, { status: 400 });
            }
            return Response.json({
                client_id: 'flw_app_agenda',
                name: 'Agenda UnB',
                request_token: 'pedido-cifrado',
                permissions: [
                    {
                        scope: 'profile:read',
                        label: 'Ler seu perfil',
                        trust_level: 'low',
                        requires: null
                    }
                ]
            });
        }
    };
    apiClient.use(middleware);
});
afterEach(() => {
    dom.testing.cleanup();
    client.clear();
    apiClient.eject(middleware);
});
async function renderPage(search = params.toString()) {
    const router = createRouter({
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch,
        routeTree: createRootRoute({ component: Route.options.component }),
        history: createMemoryHistory({ initialEntries: [`/autorizar?${search}`] })
    });
    await router.load();
    return dom.testing.render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
}

test('preserva o pedido completo ao exigir login', async () => {
    const href = `/autorizar?${params}`;
    expect(
        runLoader(Route, {
            context: { queryClient: fakeQueryClient(() => null) },
            location: { href }
        })
    ).rejects.toMatchObject({ options: { to: '/login', search: { returnTo: href } } });
});

test.each([true, false])(
    'envia decisão explícita e mantém falha no Followw (%s)',
    async (approved) => {
        const page = await renderPage();
        expect(await page.findByText('Conectar Agenda UnB?')).toBeTruthy();
        expect(page.getByText('Ler seu perfil')).toBeTruthy();
        dom.testing.fireEvent.click(
            page.getByRole('button', { name: approved ? 'Autorizar' : 'Recusar' })
        );
        expect(await page.findByRole('alert')).toBeTruthy();
        expect(decisions).toEqual([{ request_token: 'pedido-cifrado', approved }]);
    }
);

test('parâmetro repetido mostra erro local sem decisão', async () => {
    const page = await renderPage(`${params}&client_id=outro`);
    expect(page.getByRole('heading', { name: 'Pedido de autorização inválido' })).toBeTruthy();
    expect(page.queryByRole('button', { name: 'Autorizar' })).toBeNull();
    expect(decisions).toEqual([]);
});

test.each([
    [401, 'Entre novamente para continuar'],
    [500, 'Não foi possível verificar o pedido']
] as const)('trata falha %s sem classificar o pedido como inválido', async (status, title) => {
    apiClient.eject(middleware);
    middleware = {
        onRequest: () => {
            throw new ApiError(status, 'Indisponível');
        }
    };
    apiClient.use(middleware);
    const page = await renderPage();
    expect(await page.findByRole('heading', { name: title })).toBeTruthy();
    expect(page.queryByRole('button', { name: 'Autorizar' })).toBeNull();
    if (status === 401)
        expect(
            page.getByRole('link', { name: 'Entrar no Followw' }).getAttribute('href')
        ).toContain('returnTo=');
    else expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
});
