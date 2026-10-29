import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import {
    Outlet,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { components } from '#/queries/schema.gen.ts';

import { OFFLINE_MESSAGE } from '#/lib/online';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { Route as LoginRoute } from '#/routes/login';

import { useDom } from '../helpers/dom';
import { fakeQueryClient, runLoader } from '../helpers/route';

const dom = useDom('http://localhost/login');

const user: components['schemas']['UserProfile'] = {
    name: 'Fulano',
    registration: '251000000',
    photo: null,
    bio: null,
    unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
    course: { id: 1, name: 'Engenharia de Software', shift: 'DIURNO' },
    entry_semester: null,
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

type Respond = (request: Request) => Response | ApiError;

describe('página de login', () => {
    let client: QueryClient;
    let middleware: Middleware;
    let requests: Request[];
    let respond: Respond;

    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        requests = [];
        respond = () => Response.json(null);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                const result = respond(request);
                if (result instanceof ApiError) throw result;
                return result;
            }
        };
        apiClient.use(middleware);
    });

    afterEach(() => {
        dom.testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
        onlineManager.setOnline(true);
    });

    async function renderLogin() {
        const root = createRootRoute({ component: Outlet });
        const router = createRouter({
            routeTree: root.addChildren([
                createRoute({
                    getParentRoute: () => root,
                    path: '/login',
                    component: LoginRoute.options.component
                }),
                createRoute({ getParentRoute: () => root, path: '/', component: () => 'Home' })
            ]),
            history: createMemoryHistory({ initialEntries: ['/login'] })
        });
        await router.load();
        const page = dom.testing.render(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );
        return { page, router };
    }

    async function submit(page: Awaited<ReturnType<typeof renderLogin>>['page']) {
        const { fireEvent } = dom.testing;
        fireEvent.change(await page.findByPlaceholderText('Matrícula'), {
            target: { value: '251000000' }
        });
        fireEvent.change(page.getByPlaceholderText('Senha do SIGAA'), {
            target: { value: 'senha123' }
        });
        fireEvent.submit(page.getByRole('button', { name: 'Entrar' }).closest('form')!);
    }

    test('login com sucesso envia as credenciais e vai para o perfil', async () => {
        respond = (request) =>
            new URL(request.url).pathname.endsWith('/me')
                ? Response.json(user)
                : Response.json(null);
        const { page, router } = await renderLogin();

        await submit(page);

        await dom.testing.waitFor(() => expect(router.state.location.pathname).toBe('/perfil'));
        expect(await requests[0].clone().json()).toEqual({
            registration: '251000000',
            password: 'senha123'
        });
        expect(client.getQueryData(['get', '/me'])).toEqual(user);
    });

    test.each([
        [new ApiError(401, 'Invalid credentials'), 'Matrícula ou senha incorretas.'],
        [new ApiError(502, 'SIGAA is unavailable'), 'Não foi possível conectar ao SIGAA.'],
        [new TypeError('Failed to fetch'), 'Não foi possível conectar ao SIGAA.']
    ])('falha %p mostra a mensagem certa e continua no login', async (error, message) => {
        respond = () => {
            if (error instanceof ApiError) return error;
            throw error;
        };
        const { page, router } = await renderLogin();

        await submit(page);

        expect((await page.findByRole('alert')).textContent).toContain(message);
        expect(router.state.location.pathname).toBe('/login');
    });

    test('cookies que não chegam ao /me avisam que o navegador bloqueou', async () => {
        respond = (request) =>
            new URL(request.url).pathname.endsWith('/me')
                ? new ApiError(401, 'Not authenticated')
                : Response.json(null);
        const { page, router } = await renderLogin();

        await submit(page);

        expect((await page.findByRole('alert')).textContent).toContain(
            'Seu navegador bloqueou o login'
        );
        expect(router.state.location.pathname).toBe('/login');
    });

    test('offline avisa da conexão e não envia', async () => {
        onlineManager.setOnline(false);
        const { page } = await renderLogin();

        await submit(page);

        expect((await page.findByRole('alert')).textContent).toBe(OFFLINE_MESSAGE);
        expect(requests).toHaveLength(0);
    });
});

const contextFailing = (error: unknown) => ({
    context: {
        queryClient: fakeQueryClient(() => {
            throw error;
        })
    }
});

describe('loader do login', () => {
    test('uma sessão ativa segue para a Home', async () => {
        const context = { context: { queryClient: fakeQueryClient(() => user) } };

        const redirect = await runLoader(LoginRoute, context).catch((error: unknown) => error);

        expect(redirect).toMatchObject({ options: { to: '/' } });
    });

    test.each([new ApiError(502, 'SIGAA is unavailable'), new TypeError('Failed to fetch')])(
        'falha %p ao ler a sessão ainda abre o login',
        async (error) => {
            expect(await runLoader(LoginRoute, contextFailing(error))).toBeUndefined();
        }
    );

    test('erro inesperado não é engolido', async () => {
        const error = new Error('bug');

        const reason = await runLoader(LoginRoute, contextFailing(error)).catch((e: unknown) => e);

        expect(reason).toBe(error);
    });
});
