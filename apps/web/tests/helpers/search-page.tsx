import type { components } from '@followw/core/queries/schema.gen.ts';
import type { UrlUpdateEvent } from 'nuqs/adapters/testing';
import type { Middleware } from 'openapi-fetch';

import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import {
    Outlet,
    RouterContextProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe } from 'bun:test';
import { Window } from 'happy-dom';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { Suspense } from 'react';

import {
    parseRouterSearch,
    stringifyRouterSearch,
    useSearchState,
    validateSearch
} from '#/lib/search-params';
import { meQueryOptions } from '#/queries/me';

import { mockBrowserLayoutEffect } from './base-ui';
import { professorRef } from './professor';
export const paged = <T,>(items: T[], page = 1) => ({
    items: items.slice((page - 1) * 25, page * 25),
    total: items.length,
    page,
    page_size: 25
});
export const turma = (number: string, schedule: string) => ({
    number,
    schedule,
    semester: '2026.2',
    professors: []
});
export const noProfessors = paged([]);
export const makeProfessor = (siape: number, name: string) => ({
    siape,
    name,
    unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
    photo: null,
    url: `https://sigaa.unb.br/perfil?siape=${siape}`
});
const carlos = [makeProfessor(99999, 'CARLOS SILVA')];
export const makeCourse = (index: number, name = `ENGENHARIA CIVIL ${index}`) => ({
    id: index,
    sigaa_id: 100 + index,
    degree: 'Bacharelado',
    name,
    shift: 'DIURNO',
    unit: { id: 1, code: 'ENG', name: 'ENGENHARIA' }
});
export const electiveStudent: components['schemas']['UserProfile'] = {
    name: 'Discente',
    registration: '1',
    photo: null,
    bio: null,
    unit: null,
    course: makeCourse(42),
    entry_semester: '2024.1',
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};

// Os detalhes da turma carregam as estatísticas anteriores.
export const noStatistics: components['schemas']['SubjectStatistics'] = {
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
    return <button onClick={() => void setSearch({ category: null })}>Limpar categoria</button>;
}

export function makeSearchRouter(isServer: boolean) {
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

export function describeSearchPage(name: string, register: (fixture: SearchPageFixture) => void) {
    describe(name, () => register(createSearchPageFixture()));
}

type SearchPageFixture = ReturnType<typeof createSearchPageFixture>;

function createSearchPageFixture() {
    const middleware: Middleware = { onRequest: () => undefined };
    const fixture = {
        client: new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        }),
        middleware,
        requests: [] as URL[],
        updates: [] as UrlUpdateEvent[],
        recommended: [] as unknown[],
        electiveOffer: [] as components['schemas']['CatalogSubject'][],
        scheduleResults: new Map<string, components['schemas']['CatalogSubject'][]>(),
        courses: [] as unknown[],
        professors: [] as unknown[],
        failPage: null as number | null,
        gate: null as Promise<void> | null,
        get testing() {
            return testing;
        },
        renderPage,
        get searchbox() {
            return searchbox;
        }
    };

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
            NodeFilter: browser.NodeFilter,
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
        restoreLayoutEffect = await mockBrowserLayoutEffect();
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

    beforeEach(() => {
        fixture.failPage = null;
        fixture.gate = null;
        fixture.requests = [];
        fixture.updates = [];
        fixture.recommended = [];
        fixture.electiveOffer = [];
        fixture.scheduleResults = new Map();
        fixture.courses = [];
        fixture.professors = carlos;
        fixture.client.setQueryData(meQueryOptions.queryKey, null);
        fixture.client.setQueryData(allClassroomsQueryOptions.queryKey, []);
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
        fixture.middleware = {
            onRequest: async ({ request }) => {
                const url = new URL(request.url);
                if (url.pathname.endsWith('/statistics')) return Response.json(noStatistics);
                fixture.requests.push(url);
                if (url.pathname.endsWith('/me')) throw new ApiError(401, 'Sem sessão');
                const q = url.searchParams.get('q');
                const page = Number(url.searchParams.get('page') ?? 1);
                const matching = q?.toLowerCase().includes('carlos') ? fixture.professors : [];
                if (url.pathname.endsWith('/public/courses')) {
                    if (page === fixture.failPage)
                        return Response.json({ detail: 'erro' }, { status: 500 });
                    await fixture.gate;
                    return Response.json(paged(fixture.courses, page));
                }
                if (url.pathname.endsWith('/public/professors'))
                    return Response.json(paged(q ? matching : fixture.professors, page));
                if (url.pathname.endsWith('/public/search')) {
                    const result = {
                        subjects: paged((q && fixture.scheduleResults.get(q)) || subjects),
                        courses: paged(fixture.courses),
                        professors: paged(matching)
                    };
                    const types = url.searchParams.getAll('type');
                    return Response.json(
                        Object.fromEntries(
                            Object.entries(result).map(([type, value]) => [
                                type,
                                types.length && !types.includes(type) ? null : value
                            ])
                        )
                    );
                }
                if (url.pathname.endsWith('/public/subjects/recommendations'))
                    return Response.json(fixture.recommended);
                if (url.searchParams.has('kind'))
                    return Response.json(paged(fixture.electiveOffer, page));
                return Response.json(
                    paged((q && fixture.scheduleResults.get(q)) || subjects, page)
                );
            }
        };
        apiClient.use(fixture.middleware);
    });

    afterEach(() => {
        testing.cleanup();
        fixture.client.clear();
        apiClient.eject(fixture.middleware);
        browser.localStorage.clear();
    });

    function renderPage(searchParams = '') {
        return testing.render(
            <QueryClientProvider client={fixture.client}>
                <RouterContextProvider router={makeLoginRouter()}>
                    <NuqsTestingAdapter
                        searchParams={searchParams}
                        hasMemory
                        onUrlUpdate={(event) => fixture.updates.push(event)}
                    >
                        <Suspense fallback={null}>
                            <BuscarTurmasPage />
                            <ResetFilters />
                        </Suspense>
                    </NuqsTestingAdapter>
                </RouterContextProvider>
            </QueryClientProvider>
        );
    }

    const searchbox = (page: ReturnType<typeof renderPage>) => {
        const input = page.getByRole('searchbox');
        if (!(input instanceof HTMLInputElement)) throw new Error('Campo de pesquisa ausente');
        return input;
    };

    return fixture;
}
