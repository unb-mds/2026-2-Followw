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
import { type SearchResult, searchQueryOptions } from '#/queries/search';

import { professorRef } from '../helpers/professor';
const noProfessors = { items: [], total: 0, page: 1, page_size: 50 };
const professorPage = (q: string | null) => {
    const isCarlos = q?.toLowerCase().includes('carlos');
    return {
        items: isCarlos
            ? [
                  {
                      siape: 99999,
                      name: 'CARLOS SILVA',
                      unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
                      photo: null,
                      url: 'https://sigaa.unb.br/perfil?siape=99999'
                  }
              ]
            : [],
        total: isCarlos ? 1 : 0,
        page: 1,
        page_size: 50
    };
};

// Os detalhes da turma carregam as estatísticas anteriores.
const noStatistics: components['schemas']['SubjectStatistics'] = {
    overall: { semester: null, classrooms: 0, shares: [] },
    semesters: []
};

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
    return <button onClick={() => void setSearch({ category: null })}>Limpar filtros</button>;
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
        history: createMemoryHistory({ initialEntries: ['/buscar?q=calculo'] }),
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
    let courses: unknown[];

    beforeEach(() => {
        requests = [];
        updates = [];
        recommended = [];
        courses = [];
        client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        });
        client.setQueryData(meQueryOptions.queryKey, null);
        const subjects = [
            {
                code: 'MAT0023',
                name: 'Cálculo 1',
                classrooms: [
                    {
                        number: '01',
                        semester: '2026.2',
                        schedule: '24N12',
                        professors: [professorRef('Carlos Silva')]
                    },
                    {
                        number: '02',
                        semester: '2026.2',
                        schedule: '35M12',
                        professors: [professorRef('Ana Silva')]
                    }
                ]
            }
        ];
        middleware = {
            onRequest: ({ request }) => {
                const url = new URL(request.url);
                if (url.pathname.endsWith('/statistics')) return Response.json(noStatistics);
                requests.push(url);
                const q = url.searchParams.get('q');
                if (url.pathname.endsWith('/public/search'))
                    return Response.json({ subjects, courses, professors: professorPage(q) });
                if (url.pathname.includes('/public/professors'))
                    return Response.json(professorPage(q));
                if (url.pathname.endsWith('/public/courses')) return Response.json(courses);
                if (url.pathname.endsWith('/public/subjects') && !url.search)
                    return Response.json(recommended);
                return Response.json(subjects);
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
        const page = renderPage('?q=calculo');
        expect(searchbox(page).value).toBe('calculo');
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        expect(requests[0].searchParams.get('q')).toBe('calculo');
    });

    test('exibe cursos antes das turmas com nome, graduação, turno e unidade', async () => {
        courses = [
            {
                id: 1,
                sigaa_id: 100,
                level: 'Graduação',
                name: 'CÁLCULO APLICADO',
                shift: 'DIURNO',
                unit: { id: 1, code: 'MAT', name: 'DEPARTAMENTO DE MATEMÁTICA' }
            }
        ];
        const page = renderPage('?q=calculo');
        await page.findByText('Cálculo 1');
        const course = page.getByRole('heading', { name: 'Cálculo Aplicado' });
        const subjects = page.getByRole('heading', { name: /^Matérias$/ });
        expect(
            course.compareDocumentPosition(subjects) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(page.getByText('Graduação · Diurno')).toBeDefined();
        expect(page.getByText('Departamento de Matemática')).toBeDefined();
        expect(searchbox(page).placeholder).toBe(
            'Busque por matérias, código, curso ou professor...'
        );
    });

    test.each([1, 5, 12])(
        'lista %i cursos em lotes de cinco e atualiza a quantidade restante',
        async (total) => {
            courses = Array.from({ length: total }, (_, index) => ({
                id: index + 1,
                sigaa_id: 100 + index,
                level: 'Graduação',
                name: `ENGENHARIA CIVIL ${index + 1}`,
                shift: 'DIURNO',
                unit: { id: 1, code: 'ENG', name: 'ENGENHARIA' }
            }));
            const page = renderPage('?q=engenharia&category=courses');
            const section = testing.within(await page.findByRole('region', { name: 'Cursos' }));
            expect(section.getByText(`${total} ${total === 1 ? 'curso' : 'cursos'}`)).toBeDefined();
            expect(section.getAllByRole('link')).toHaveLength(Math.min(total, 5));
            for (let visible = 5; visible < total; visible += 5) {
                testing.fireEvent.click(
                    section.getByRole('button', {
                        name: `Ver mais cursos (${total - visible} restantes)`
                    })
                );
                expect(section.getAllByRole('link')).toHaveLength(Math.min(total, visible + 5));
            }
            expect(section.queryByRole('button', { name: /Ver mais cursos/ })).toBeNull();
        }
    );

    test('uma nova busca volta a mostrar os cinco primeiros cursos', async () => {
        courses = Array.from({ length: 12 }, (_, index) => ({
            id: index + 1,
            sigaa_id: 100 + index,
            level: 'Graduação',
            name: `ENGENHARIA CIVIL ${index + 1}`,
            shift: null,
            unit: { id: 1, code: 'ENG', name: 'ENGENHARIA' }
        }));
        const page = renderPage('?q=eng&category=courses');
        testing.fireEvent.click(
            await page.findByRole('button', { name: 'Ver mais cursos (7 restantes)' })
        );
        expect(
            testing.within(page.getByRole('region', { name: 'Cursos' })).getAllByRole('link')
        ).toHaveLength(10);
        testing.fireEvent.change(searchbox(page), { target: { value: 'engenharia' } });
        await page.findByRole('button', { name: 'Ver mais cursos (7 restantes)' });
        expect(
            testing.within(page.getByRole('region', { name: 'Cursos' })).getAllByRole('link')
        ).toHaveLength(5);
    });

    test('consulta a busca única ao pesquisar e esconde os cursos ao limpar o campo', async () => {
        courses = [
            {
                id: 1,
                sigaa_id: 100,
                level: 'Graduação',
                name: 'CÁLCULO APLICADO',
                shift: null,
                unit: { id: 1, code: null, name: 'MATEMÁTICA' }
            }
        ];
        const page = renderPage();
        expect(requests).toHaveLength(0);
        testing.fireEvent.change(searchbox(page), { target: { value: 'calculo' } });
        await testing.waitFor(() =>
            expect(requests.map((url) => url.pathname)).toEqual(['/api/public/search'])
        );
        await page.findByRole('heading', { name: 'Cálculo Aplicado' });
        testing.fireEvent.change(searchbox(page), { target: { value: '' } });
        await testing.waitFor(() =>
            expect(page.queryByRole('region', { name: 'Cursos' }) === null).toBe(true)
        );
    });

    test('pesquisa não tem filtros de turno nem barra da grade sem turmas', async () => {
        const page = renderPage('?q=calculo');
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        expect(page.queryByRole('combobox')).toBeNull();
        expect(page.queryByRole('toolbar', { name: 'Turmas selecionadas' })).toBeNull();
    });

    test.each(['ab', 'a'.repeat(33)])('URL com query inválida %s não chama a API', async (q) => {
        const page = renderPage(`?q=${q}`);
        expect(searchbox(page).value).toBe(q);
        await testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(requests).toHaveLength(0);
    });

    test.each(['abc', 'a'.repeat(32), 'Carlos Silva'])(
        'busca válida %s consulta e mostra resultados',
        async (q) => {
            const page = renderPage(`?q=${q}`);
            await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
            expect(
                requests.find((r) => r.pathname.endsWith('/public/search'))?.searchParams.get('q')
            ).toBe(q);
        }
    );

    test('digitação atualiza a URL imediatamente e a API após o debounce', async () => {
        const page = renderPage();
        const input = searchbox(page);
        testing.fireEvent.change(input, { target: { value: 'ab' } });
        await testing.waitFor(() => expect(updates.at(-1)?.searchParams.get('q')).toBe('ab'));
        expect(requests).toHaveLength(0);
        testing.fireEvent.change(input, { target: { value: 'Carlos Silva' } });
        expect(input.value).toBe('Carlos Silva');
        expect(requests).toHaveLength(0);
        await testing.waitFor(() =>
            expect(requests.filter((r) => r.pathname.endsWith('/public/search'))).toHaveLength(1)
        );
        expect(
            requests.find((r) => r.pathname.endsWith('/public/search'))?.searchParams.get('q')
        ).toBe('Carlos Silva');
        testing.fireEvent.change(input, { target: { value: '' } });
        await testing.waitFor(() => expect(updates.at(-1)?.searchParams.has('q')).toBe(false));
    });

    test('query inválida mantém os resultados da última busca', async () => {
        const page = renderPage('?q=calculo');
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        testing.fireEvent.change(searchbox(page), { target: { value: 'ca' } });
        await testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(page.getByText('Cálculo 1')).toBeDefined();
        expect(page.queryByText(/Digite de 3 a 32/)).toBeNull();
        expect(requests.filter((r) => r.pathname.endsWith('/public/search'))).toHaveLength(1);
    });

    test('campo impede ou trunca caracteres acima de 32', async () => {
        const page = renderPage();
        const input = searchbox(page);
        expect(input.maxLength).toBe(32);
        testing.fireEvent.change(input, { target: { value: 'a'.repeat(33) } });
        expect(input.value).toBe('a'.repeat(32));
        await testing.waitFor(() =>
            expect(requests.filter((r) => r.pathname.endsWith('/public/search'))).toHaveLength(1)
        );
        expect(
            requests.find((r) => r.pathname.endsWith('/public/search'))?.searchParams.get('q')
        ).toHaveLength(32);
    });

    test('limpar o filtro remove seu parâmetro e preserva a consulta', async () => {
        const page = renderPage('?q=calculo&category=courses');
        testing.fireEvent.click(page.getByRole('button', { name: 'Limpar filtros' }));
        await testing.waitFor(() =>
            expect(updates.at(-1)?.searchParams.has('category')).toBe(false)
        );
        expect(updates.at(-1)?.searchParams.get('q')).toBe('calculo');
        await testing.waitFor(() => expect(page.getByText('2 turmas')).toBeDefined());
    });

    test('adiciona pelo resultado e mantém a grade ao mudar a busca', async () => {
        client.setQueryData(searchQueryOptions('calculo').queryKey, {
            subjects: [
                {
                    code: 'MAT0023',
                    name: 'Cálculo 1',
                    classrooms: [
                        { number: '01', semester: '2026.2', professors: [], schedule: '24M12' }
                    ]
                }
            ],
            courses: [],
            professors: noProfessors
        });
        const page = renderPage('?q=calculo');
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

    test('abas de categoria aparecem para visitantes e substituem os tipos de matéria', () => {
        const page = renderPage('?q=calculo');
        expect(page.getByRole('group', { name: 'Categoria da busca' })).toBeDefined();
        for (const name of ['Todos', 'Matérias', 'Cursos', 'Docentes']) {
            expect(page.getByRole('button', { name })).toBeDefined();
        }
        expect(page.getByRole('button', { name: 'Todos' }).getAttribute('aria-pressed')).toBe(
            'true'
        );
        expect(page.queryByRole('button', { name: 'Obrigatórias' })).toBeNull();
        expect(page.queryByRole('button', { name: 'Optativas' })).toBeNull();
    });

    test('cada aba mostra apenas a categoria escolhida e preserva o texto da busca', async () => {
        courses = [
            {
                id: 1,
                sigaa_id: 100,
                level: 'Graduação',
                name: 'ESTUDOS CARLOS SILVA',
                shift: null,
                unit: { id: 1, code: null, name: 'UNIDADE' }
            }
        ];
        const page = renderPage('?q=Carlos Silva');
        const tab = (name: string) => page.getByRole('button', { name });
        await page.findByRole('heading', { name: 'Docentes' });
        await page.findByText('Cálculo 1');
        expect(page.getByRole('heading', { name: 'Estudos Carlos Silva' })).toBeDefined();
        testing.fireEvent.click(tab('Matérias'));
        await testing.waitFor(() =>
            expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull()
        );
        expect(page.queryByRole('region', { name: 'Cursos' })).toBeNull();
        expect(page.getByText('Cálculo 1')).toBeDefined();
        expect(updates.at(-1)?.searchParams.get('category')).toBe('classrooms');
        testing.fireEvent.click(tab('Cursos'));
        await page.findByRole('heading', { name: 'Estudos Carlos Silva' });
        expect(page.queryByText('Cálculo 1')).toBeNull();
        expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull();
        testing.fireEvent.click(tab('Docentes'));
        await page.findByRole('heading', { name: 'Docentes' });
        expect(page.queryByRole('region', { name: 'Cursos' })).toBeNull();
        expect(page.queryByText('Cálculo 1')).toBeNull();
        expect(updates.at(-1)?.searchParams.get('q')).toBe('Carlos Silva');
        testing.fireEvent.click(tab('Todos'));
        await page.findByText('Cálculo 1');
        expect(page.getByRole('heading', { name: 'Estudos Carlos Silva' })).toBeDefined();
        expect(page.getByRole('heading', { name: 'Docentes' })).toBeDefined();
        expect(updates.at(-1)?.searchParams.has('category')).toBe(false);
    });

    test('aba Todos com texto faz uma única requisição à busca', async () => {
        const page = renderPage('?q=Carlos Silva');
        await page.findByRole('heading', { name: 'Docentes' });
        await testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        expect(requests.map((url) => url.pathname)).toEqual(['/api/public/search']);
        expect(requests[0].searchParams.getAll('type')).toEqual([]);
    });

    test('aba Todos sem resultados mostra uma única mensagem', async () => {
        client.setQueryData(searchQueryOptions('nada').queryKey, {
            subjects: [],
            courses: [],
            professors: noProfessors
        });
        const page = renderPage('?q=nada');
        expect(page.getByText('Nenhum resultado encontrado. Tente mudar a busca.')).toBeDefined();
        expect(page.queryByText(/Nenhuma matéria|Nenhum curso|Nenhum docente/)).toBeNull();
    });

    test.each([
        ['classrooms', '/public/subjects'],
        ['courses', '/public/courses'],
        ['professors', '/public/professors']
    ] as const)(
        'URL direta da categoria %s consulta somente o recurso correspondente',
        async (category, resource) => {
            const page = renderPage(`?q=Carlos Silva&category=${category}`);
            await testing.waitFor(() => expect(requests.length).toBe(1));
            expect(requests[0].pathname.endsWith(resource)).toBe(true);
            expect(
                page
                    .getByRole('button', {
                        name: { classrooms: 'Matérias', courses: 'Cursos', professors: 'Docentes' }[
                            category
                        ]
                    })
                    .getAttribute('aria-pressed')
            ).toBe('true');
        }
    );

    test.each([
        ['courses', 'Nenhum curso encontrado. Tente mudar a busca.'],
        ['professors', 'Nenhum docente encontrado. Tente mudar a busca.']
    ])(
        'categoria %s informa ausência de resultados sem consultar turmas',
        async (category, message) => {
            const page = renderPage(`?q=calculo&category=${category}`);
            await page.findByText(message);
            expect(requests.some((url) => url.pathname.endsWith('/public/subjects'))).toBe(false);
        }
    );

    test('recomendações continuam em Todos e Turmas e não aparecem nas outras categorias', async () => {
        const user: components['schemas']['UserProfile'] = {
            name: 'Discente',
            registration: '1',
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
        client.setQueryData(meQueryOptions.queryKey, user);
        client.setQueryData(allClassroomsQueryOptions.queryKey, []);
        const classrooms = [{ number: '01', semester: '2026.2', professors: [] }];
        recommended = [
            { code: 'MAT0025', name: 'Cálculo 1', kind: 'mandatory', classrooms },
            { code: 'MAT0029', name: 'Cálculo 9', kind: 'optional', classrooms }
        ];
        const page = renderPage();
        await page.findByText('Cálculo 1');
        expect(page.getByText('Cálculo 9')).toBeDefined();
        testing.fireEvent.click(page.getByRole('button', { name: 'Matérias' }));
        await page.findByRole('region', { name: 'Matérias recomendadas' });
        testing.fireEvent.click(page.getByRole('button', { name: 'Cursos' }));
        await testing.waitFor(() =>
            expect(page.queryByRole('region', { name: 'Matérias recomendadas' })).toBeNull()
        );
        expect(page.getByText(/Digite de 3 a 32/)).toBeDefined();
        testing.fireEvent.click(page.getByRole('button', { name: 'Docentes' }));
        await testing.waitFor(() => expect(page.queryByText('Cálculo 1')).toBeNull());
        expect(requests.every((url) => !url.search)).toBe(true);
    });

    test('falha na busca única mostra um só carregamento e um só erro em Todos', async () => {
        apiClient.eject(middleware);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(new URL(request.url));
                throw new Error('Sem conexão');
            }
        };
        apiClient.use(middleware);
        const page = renderPage('?q=Carlos Silva');
        expect(page.getAllByText('Buscando...')).toHaveLength(1);
        await page.findByText('Não foi possível buscar.');
        expect(page.queryByText(/Não foi possível buscar (as|os)/)).toBeNull();
        expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull();
        expect(page.queryByRole('region', { name: 'Cursos' })).toBeNull();
        expect(requests.map((url) => url.pathname)).toEqual(['/api/public/search']);
    });

    test('mostra as matérias em lotes de 20', async () => {
        const subjects = Array.from({ length: 45 }, (_, i) => ({
            code: `MAT${String(i).padStart(4, '0')}`,
            name: `Matéria ${i}`,
            classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
        }));
        client.setQueryData(searchQueryOptions('materia').queryKey, {
            subjects,
            courses: [],
            professors: noProfessors
        });
        const page = renderPage('?q=materia');
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
        const options = searchQueryOptions('FGA0173');
        client.setQueryData(options.queryKey, {
            subjects: [saved],
            courses: [],
            professors: noProfessors
        });
        apiClient.eject(middleware);
        middleware = {
            onRequest: ({ request }) => {
                const url = new URL(request.url);
                if (url.pathname.endsWith('/statistics')) return Response.json(noStatistics);
                requests.push(url);
                return Response.json({
                    subjects: [
                        {
                            ...saved,
                            prerequisites: [
                                [{ code: 'FGA0138', subject: { code: 'FGA0138', name } }],
                                ...saved.prerequisites.slice(1)
                            ]
                        }
                    ],
                    courses: [],
                    professors: noProfessors
                });
            }
        };
        apiClient.use(middleware);
        const page = renderPage('?q=FGA0173');
        expect(requests).toHaveLength(0);

        testing.fireEvent.click(page.getByRole('button', { name: /FGA0173/ }));
        const trigger = await page.findByRole('button', { name: 'Detalhes da turma 01' });
        testing.fireEvent.click(trigger);

        await testing.waitFor(() =>
            expect(client.getQueryData<SearchResult>(options.queryKey)?.subjects).toEqual([
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
        client.setQueryData(searchQueryOptions('calculo').queryKey, {
            subjects: [
                {
                    code: 'MAT0023',
                    name: 'Cálculo 1',
                    classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
                }
            ],
            courses: [],
            professors: noProfessors
        });
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
        await testing.waitFor(() => expect(router.state.location.search.q).toBe('Carlos Silva'));
        await testing.act(() => router.navigate({ to: '/buscar', search: { q: 'calculo' } }));
        expect(searchbox(page).value).toBe('calculo');
        expect(errors).toEqual([]);
    });

    test('exibe docentes no topo antes das turmas quando houver professor correspondente', async () => {
        const page = renderPage('?q=Carlos Silva');
        await testing.waitFor(() =>
            expect(page.getByRole('heading', { name: 'Docentes' })).toBeDefined()
        );
        await testing.waitFor(() => expect(page.getByText('Cálculo 1')).toBeDefined());
        const docentes = page.getByRole('heading', { name: 'Docentes' });
        const materias = page.getByText('Cálculo 1');
        // Prioridade pré-estabelecida: a seção de matérias segue a seção de docentes
        expect(docentes.compareDocumentPosition(materias)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    test('buscar código depois de um nome esconde os docentes da busca anterior', async () => {
        const page = renderPage('?q=Carlos Silva');
        await testing.waitFor(() =>
            expect(page.getByRole('heading', { name: 'Docentes' })).toBeDefined()
        );

        testing.fireEvent.change(searchbox(page), { target: { value: 'MAT0023' } });
        await testing.act(() => new Promise((resolve) => setTimeout(resolve, 350)));
        await testing.waitFor(() =>
            expect(page.queryByRole('heading', { name: 'Docentes' })).toBeNull()
        );
        expect(page.getByText('Cálculo 1')).toBeDefined();
    });
});
