import type { UrlUpdateEvent } from 'nuqs/adapters/testing';
import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import {
    Outlet,
    RouterContextProvider,
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useLayoutEffect } from 'react';
import { renderToString } from 'react-dom/server';

import type { components } from '#/queries/schema.gen';

import {
    parseRouterSearch,
    stringifyRouterSearch,
    useSearchState,
    validateSearch
} from '#/lib/search-params';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { apiClient } from '#/queries/client';
import { meQueryOptions } from '#/queries/me';
import { subjectsQueryOptions } from '#/queries/subjects';
let Route: typeof import('#/routes/_app/buscar').Route;

let testing: typeof import('@testing-library/react/pure');
let browser: Window;
const wasServer = environmentManager.isServer();
const previousGlobals = new Map<string, PropertyDescriptor | undefined>();
let restoreLayoutEffect: () => Promise<void>;

function BuscarTurmasPage() {
    const Page = Route.options.component;
    if (!Page) throw new Error('Componente da busca ausente');
    return <Page />;
}

function ResetFilters() {
    const [, setSearch] = useSearchState();
    return <button onClick={() => void setSearch({ tipo: null })}>Limpar filtros</button>;
}

function makeSearchRouter(isServer: boolean) {
    const root = createRootRoute({
        component: () => (
            <NuqsAdapter>
                <Outlet />
            </NuqsAdapter>
        )
    });
    const search = createRoute({
        getParentRoute: () => root,
        path: '/buscar',
        validateSearch,
        component: BuscarTurmasPage
    });
    const router = createRouter({
        routeTree: root.addChildren([search]),
        history: createMemoryHistory({ initialEntries: ['/buscar?busca=calculo'] }),
        isServer,
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch
    });
    router.ssr = { manifest: undefined };
    return router;
}

function makeLoginRouter() {
    const root = createRootRoute();
    const login = createRoute({ getParentRoute: () => root, path: '/login' });
    return createRouter({ routeTree: root.addChildren([login]) });
}

beforeAll(async () => {
    environmentManager.setIsServer(() => false);
    browser = new Window({ url: 'http://localhost/buscar' });
    const globals = {
        window: browser,
        document: browser.document,
        navigator: browser.navigator,
        location: browser.location,
        history: browser.history,
        HTMLElement: browser.HTMLElement,
        HTMLInputElement: browser.HTMLInputElement,
        Element: browser.Element,
        Node: browser.Node,
        DocumentFragment: browser.DocumentFragment,
        MutationObserver: browser.MutationObserver,
        ResizeObserver: browser.ResizeObserver,
        getComputedStyle: browser.getComputedStyle.bind(browser),
        requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
        cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
        scrollTo: browser.scrollTo.bind(browser),
        IS_REACT_ACT_ENVIRONMENT: true
    };
    for (const [key, value] of Object.entries(globals)) {
        previousGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    testing = await import('@testing-library/react/pure');
    const { useIsoLayoutEffect } = await import('@base-ui/utils/useIsoLayoutEffect');
    await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({
        useIsoLayoutEffect: useLayoutEffect
    }));
    restoreLayoutEffect = async () => {
        await mock.module('@base-ui/utils/useIsoLayoutEffect', () => ({ useIsoLayoutEffect }));
    };
    ({ Route } = await import('#/routes/_app/buscar'));
});

afterAll(async () => {
    await restoreLayoutEffect();
    environmentManager.setIsServer(() => wasServer);
    await browser.happyDOM.abort();
    for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

describe('página de busca com estado na URL', () => {
    let client: QueryClient;
    let middleware: Middleware;
    let requests: URL[];
    let updates: UrlUpdateEvent[];
    let recommended: unknown[];

    beforeEach(() => {
        requests = [];
        updates = [];
        recommended = [];
        client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        });
        client.setQueryData(meQueryOptions.queryKey, null);
        middleware = {
            onRequest: ({ request }) => {
                const url = new URL(request.url);
                requests.push(url);
                if (url.pathname.endsWith('/public/subjects') && !url.search)
                    return Response.json(recommended);
                return Response.json([
                    {
                        code: 'MAT0023',
                        name: 'Cálculo 1',
                        classrooms: [
                            {
                                number: '01',
                                semester: '2026.2',
                                schedule: '24N12',
                                professors: ['Carlos Silva']
                            },
                            {
                                number: '02',
                                semester: '2026.2',
                                schedule: '35M12',
                                professors: ['Ana Silva']
                            }
                        ]
                    }
                ]);
            }
        };
        apiClient.use(middleware);
    });

    afterEach(() => {
        testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
        browser.localStorage.clear();
    });

    const renderPage = (searchParams = '') =>
        testing.render(
            <QueryClientProvider client={client}>
                <RouterContextProvider router={makeLoginRouter()}>
                    <NuqsTestingAdapter
                        searchParams={searchParams}
                        hasMemory
                        onUrlUpdate={(event) => updates.push(event)}
                    >
                        <BuscarTurmasPage />
                        <ResetFilters />
                    </NuqsTestingAdapter>
                </RouterContextProvider>
            </QueryClientProvider>
        );

    const searchbox = (page: ReturnType<typeof renderPage>) => {
        const input = page.getByRole('searchbox');
        if (!(input instanceof HTMLInputElement)) throw new Error('Campo de pesquisa ausente');
        return input;
    };

    test('URL direta preenche campo e carrega resultados', async () => {
        const page = renderPage('?busca=calculo');
        expect(searchbox(page).value).toBe('calculo');
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        expect(requests[0].searchParams.get('q')).toBe('calculo');
    });

    test('pesquisa não tem filtros de turno nem barra da grade sem turmas', async () => {
        const page = renderPage('?busca=calculo');
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        expect(page.queryByRole('combobox')).toBeNull();
        expect(page.queryByRole('toolbar', { name: 'Turmas selecionadas' })).toBeNull();
    });

    test.each(['ab', 'a'.repeat(33)])('URL com query inválida %s não chama a API', async (q) => {
        const page = renderPage(`?busca=${q}`);
        expect(searchbox(page).value).toBe(q);
        await testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(requests).toHaveLength(0);
    });

    test.each(['abc', 'a'.repeat(32), 'Carlos Silva'])(
        'busca válida %s consulta e mostra resultados',
        async (q) => {
            const page = renderPage(`?busca=${q}`);
            await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
            expect(requests[0].searchParams.get('q')).toBe(q);
        }
    );

    test('digitação atualiza a URL imediatamente e a API após o debounce', async () => {
        const page = renderPage();
        const input = searchbox(page);
        testing.fireEvent.change(input, { target: { value: 'ab' } });
        await testing.waitFor(() => expect(updates.at(-1)?.searchParams.get('busca')).toBe('ab'));
        expect(requests).toHaveLength(0);
        testing.fireEvent.change(input, { target: { value: 'Carlos Silva' } });
        expect(input.value).toBe('Carlos Silva');
        expect(requests).toHaveLength(0);
        await testing.waitFor(() => expect(requests).toHaveLength(1));
        expect(requests[0].searchParams.get('q')).toBe('Carlos Silva');
        testing.fireEvent.change(input, { target: { value: '' } });
        await testing.waitFor(() => expect(updates.at(-1)?.searchParams.has('busca')).toBe(false));
    });

    test('query inválida mantém os resultados da última busca', async () => {
        const page = renderPage('?busca=calculo');
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        testing.fireEvent.change(searchbox(page), { target: { value: 'ca' } });
        await testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(page.getByText('Cálculo 1')).toBeDefined();
        expect(page.queryByText(/Digite de 3 a 32/)).toBeNull();
        expect(requests).toHaveLength(1);
    });

    test('campo impede ou trunca caracteres acima de 32', async () => {
        const page = renderPage();
        const input = searchbox(page);
        expect(input.maxLength).toBe(32);
        testing.fireEvent.change(input, { target: { value: 'a'.repeat(33) } });
        expect(input.value).toBe('a'.repeat(32));
        await testing.waitFor(() => expect(requests).toHaveLength(1));
        expect(requests[0].searchParams.get('q')).toHaveLength(32);
    });

    test('limpar o filtro remove seu parâmetro e preserva a consulta', async () => {
        const page = renderPage('?busca=calculo&tipo=Optativas');
        testing.fireEvent.click(page.getByRole('button', { name: 'Limpar filtros' }));
        await testing.waitFor(() => expect(updates.at(-1)?.searchParams.has('tipo')).toBe(false));
        expect(updates.at(-1)?.searchParams.get('busca')).toBe('calculo');
        await testing.waitFor(() => expect(page.getByText('2 turmas')).toBeDefined());
    });

    test('adiciona pelo resultado e mantém a grade ao mudar a busca', async () => {
        client.setQueryData(subjectsQueryOptions({ q: 'calculo' }).queryKey, [
            {
                code: 'MAT0023',
                name: 'Cálculo 1',
                classrooms: [
                    { number: '01', semester: '2026.2', professors: [], schedule: '24M12' }
                ]
            }
        ]);
        const page = renderPage('?busca=calculo');
        testing.fireEvent.click(page.getByRole('button', { name: /MAT0023/ }));
        testing.fireEvent.click(
            await page.findByRole('button', { name: 'Adicionar à grade: MAT0023, turma 01' })
        );
        expect(page.queryByRole('dialog')).toBeNull();
        testing.fireEvent.change(searchbox(page), { target: { value: 'fisica' } });
        await testing.waitFor(() =>
            expect(requests.some((url) => url.searchParams.get('q') === 'fisica')).toBe(true)
        );
        expect(page.getByRole('toolbar', { name: 'Turmas selecionadas' }).textContent).toContain(
            '1 turma'
        );
        testing.fireEvent.click(page.getByRole('button', { name: 'Ver grade' }));
        await page.findByRole('dialog', { name: 'Minha grade semanal' });
        expect(page.getByRole('table').textContent).toContain('MAT0023');
    });

    test('abas mostram só as recomendações do tipo, na ordem da API, mesmo com busca', async () => {
        const user: components['schemas']['UserProfile'] = {
            name: 'Discente',
            registration: '202600001',
            photo: null,
            bio: null,
            unit: null,
            course: null,
            entry_semester: null,
            integralization: null,
            workload: null,
            ira: null,
            mp: null,
            level: 'Graduação'
        };
        client.setQueryData(meQueryOptions.queryKey, user);
        client.setQueryData(allClassroomsQueryOptions.queryKey, []);
        const classrooms = [{ number: '01', semester: '2026.2', professors: [] }];
        client.setQueryData(subjectsQueryOptions({ q: 'calculo' }).queryKey, [
            { code: 'MAT0025', name: 'Cálculo 1', kind: 'mandatory', classrooms },
            { code: 'MAT0029', name: 'Cálculo 9', kind: 'optional', classrooms }
        ]);
        recommended = [
            { code: 'MAT0027', name: 'Cálculo 3', kind: 'optional', classrooms },
            { code: 'FIS0001', name: 'Física 1', kind: 'optional', classrooms },
            { code: 'MAT0025', name: 'Cálculo 1', kind: 'mandatory', classrooms },
            { code: 'MAT0026', name: 'Cálculo 2', kind: 'optional', classrooms }
        ];
        const page = renderPage('?busca=calculo');
        const tab = (name: string) => page.getByRole('button', { name });
        const shown = () =>
            Array.from(page.container.querySelectorAll('[data-slot="accordion-item"]'), (item) =>
                item.textContent?.match(/[A-Z]{3}\d{4}/)?.at(0)
            );
        expect(tab('Todas').getAttribute('aria-pressed')).toBe('true');
        expect(page.queryByRole('button', { name: 'Módulo livre' })).toBeNull();
        expect(shown()).toEqual(['MAT0025', 'MAT0029']);
        testing.fireEvent.click(tab('Optativas'));
        await testing.waitFor(() =>
            expect(updates.at(-1)?.searchParams.get('tipo')).toBe('Optativas')
        );
        await testing.waitFor(() => expect(shown()).toEqual(['MAT0027', 'MAT0026']));
        expect(page.getByRole('region', { name: 'Optativas disponíveis' })).toBeDefined();
        testing.fireEvent.click(tab('Obrigatórias'));
        await testing.waitFor(() => expect(shown()).toEqual(['MAT0025']));
    });

    test('abas de tipo só aparecem com a conta logada', () => {
        const page = renderPage('?busca=calculo');
        expect(page.queryByRole('group', { name: 'Tipo de matéria' })).toBeNull();
    });

    test('mostra as matérias em lotes de 20', async () => {
        const subjects = Array.from({ length: 45 }, (_, i) => ({
            code: `MAT${String(i).padStart(4, '0')}`,
            name: `Matéria ${i}`,
            classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
        }));
        client.setQueryData(subjectsQueryOptions({ q: 'materia' }).queryKey, subjects);
        const page = renderPage('?busca=materia');
        const items = () => page.container.querySelectorAll('[data-slot="accordion-item"]');
        expect(items()).toHaveLength(20);
        expect(page.getByText('45 resultados')).toBeDefined();
        testing.fireEvent.click(page.getByRole('button', { name: 'Mostrar mais' }));
        expect(items()).toHaveLength(40);
        testing.fireEvent.click(page.getByRole('button', { name: 'Mostrar mais' }));
        expect(items()).toHaveLength(45);
        expect(page.queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
    });

    test('abrir detalhes atualiza no cache os nomes ausentes dos requisitos', async () => {
        const name = 'MÉTODOS DE DESENVOLVIMENTO DE SOFTWARE';
        const saved = {
            code: 'FGA0173',
            name: 'INTERAÇÃO HUMANO COMPUTADOR',
            hours: 60,
            prerequisites: [
                [{ code: 'FGA0138', subject: null }],
                [{ code: 'FGA0312', subject: { code: 'FGA0312', name } }]
            ],
            classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
        };
        const options = subjectsQueryOptions({ q: 'FGA0173' });
        client.setQueryData(options.queryKey, [saved]);
        apiClient.eject(middleware);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(new URL(request.url));
                return Response.json([
                    {
                        ...saved,
                        prerequisites: [
                            [{ code: 'FGA0138', subject: { code: 'FGA0138', name } }],
                            ...saved.prerequisites.slice(1)
                        ]
                    }
                ]);
            }
        };
        apiClient.use(middleware);
        const page = renderPage('?busca=FGA0173');
        expect(requests).toHaveLength(0);

        testing.fireEvent.click(page.getByRole('button', { name: /FGA0173/ }));
        const trigger = await page.findByRole('button', { name: saved.name });
        testing.fireEvent.click(trigger);

        await testing.waitFor(() =>
            expect(client.getQueryData(options.queryKey)).toEqual([
                {
                    ...saved,
                    prerequisites: [
                        [{ code: 'FGA0138', subject: { code: 'FGA0138', name } }],
                        [{ code: 'FGA0312', subject: { code: 'FGA0312', name } }]
                    ]
                }
            ])
        );
        expect(requests).toHaveLength(1);
        expect(requests[0].searchParams.get('q')).toBe('FGA0173');
        testing.fireEvent.click(trigger);
        expect(requests).toHaveLength(1);
    });

    test('adaptador real hidrata a URL e acompanha digitação e navegação do Router', async () => {
        client.setQueryData(subjectsQueryOptions({ q: 'calculo' }).queryKey, [
            {
                code: 'MAT0023',
                name: 'Cálculo 1',
                classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
            }
        ]);
        const server = makeSearchRouter(true);
        await server.load();
        const container = document.createElement('div');
        container.innerHTML = renderToString(
            <QueryClientProvider client={client}>
                <RouterProvider router={server} />
            </QueryClientProvider>
        );
        document.body.append(container);
        expect(container.querySelector('input')?.value).toBe('calculo');
        const router = makeSearchRouter(false);
        await router.load();
        const errors: string[] = [];
        const page = testing.render(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
            {
                container,
                hydrate: true,
                onRecoverableError: (error) => errors.push(String(error))
            }
        );
        expect(errors).toEqual([]);
        testing.fireEvent.change(searchbox(page), { target: { value: 'Carlos Silva' } });
        await testing.waitFor(() =>
            expect(router.state.location.search.busca).toBe('Carlos Silva')
        );
        await testing.act(() => router.navigate({ to: '/buscar', search: { busca: 'calculo' } }));
        expect(searchbox(page).value).toBe('calculo');
        expect(errors).toEqual([]);
    });
});
