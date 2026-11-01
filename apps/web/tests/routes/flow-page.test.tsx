import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider
} from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { renderToString } from 'react-dom/server';

import type { PublicCourse } from '#/queries/courses';
import type { components } from '#/queries/schema.gen';

import { getCurrentSemester } from '#/calendar';
import { AppLayout } from '#/components/AppLayout';
import { CourseSection } from '#/components/search/CourseSection';
import { TurmaSection } from '#/components/search/TurmaSection';
import { validateFlowSearch } from '#/lib/curriculum/navigation';
import { parseRouterSearch, stringifyRouterSearch, validateSearch } from '#/lib/search-params';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { apiClient } from '#/queries/client';
import { courseQueryOptions } from '#/queries/courses';
import { curriculumQueryOptions } from '#/queries/curriculum';
import { toApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';
import { Route } from '#/routes/_app/cursos.$id';

import { curriculum, type RawCurriculum } from '../helpers/curriculum';

let testing: typeof import('@testing-library/react/pure');
let browser: Window;
let width = 390;
const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
const wasServer = environmentManager.isServer();
class ViewportObserver implements ResizeObserver {
    static active = new Set<ViewportObserver>();
    target?: Element;
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
        this.target = target;
        ViewportObserver.active.add(this);
        this.emit();
    }
    disconnect() {
        this.target = undefined;
        ViewportObserver.active.delete(this);
    }
    unobserve() {
        this.disconnect();
    }
    emit() {
        if (this.target)
            this.callback(
                [
                    {
                        target: this.target,
                        contentRect: new browser.DOMRectReadOnly(0, 0, width, 800),
                        borderBoxSize: [],
                        contentBoxSize: [],
                        devicePixelContentBoxSize: []
                    }
                ],
                this
            );
    }
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
        HTMLFormElement: browser.HTMLFormElement,
        Event: browser.Event,
        Element: browser.Element,
        Node: browser.Node,
        DocumentFragment: browser.DocumentFragment,
        MutationObserver: browser.MutationObserver,
        ResizeObserver: ViewportObserver,
        getComputedStyle: browser.getComputedStyle.bind(browser),
        requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
        cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
        scrollTo: browser.scrollTo.bind(browser),
        IS_REACT_ACT_ENVIRONMENT: true
    };
    for (const [key, value] of Object.entries(globals)) {
        originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    testing = await import('@testing-library/react/pure');
});
afterAll(async () => {
    environmentManager.setIsServer(() => wasServer);
    await browser.happyDOM.abort();
    for (const [key, descriptor] of originalGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const user: components['schemas']['UserProfile'] = {
    name: 'Discente',
    registration: '1',
    photo: null,
    bio: null,
    unit: null,
    course: { id: 42, name: 'CURSO TESTE', shift: null },
    entry_semester: '2026.2',
    integralization: null,
    workload: null,
    period_max_workload: null,
    ira: null,
    mp: null,
    level: 'Graduação'
};
const rawMatrix: RawCurriculum = {
    sigaa_id: 1,
    code: '01',
    course_id: 42,
    entry_semester: '2026.2',
    valid_from: '2026.1',
    matrix: 'Teste',
    shift: null,
    periods: [
        { period: 1, subjects: [{ code: 'A', name: 'Base', hours: 60 }] },
        {
            period: 2,
            subjects: [
                { code: 'B', name: 'Avançada', hours: 30, prerequisites: [['A', 'EXTERNA']] }
            ]
        }
    ]
};
const matrix = curriculum(rawMatrix);
const courses: PublicCourse[] = [
    {
        id: 42,
        name: 'CURSO TESTE',
        sigaa_id: 100,
        level: 'Graduação',
        shift: null,
        unit: { id: 1, code: 'UNI', name: 'UNIDADE' }
    },
    {
        id: 99,
        name: 'OUTRO CURSO',
        sigaa_id: 101,
        level: 'Graduação',
        shift: null,
        unit: { id: 1, code: 'UNI', name: 'UNIDADE' }
    }
];
function SearchFixture() {
    return (
        <>
            <CourseSection courses={courses} />
            <TurmaSection
                subjects={[
                    {
                        code: 'A',
                        name: 'Base',
                        classrooms: [{ number: '01', semester: '2026.2', professors: [] }]
                    }
                ]}
            />
        </>
    );
}
function makeRouter(url: string, isServer = false) {
    const root = createRootRoute({ component: Outlet });
    const app = createRoute({
        getParentRoute: () => root,
        id: '_app',
        component: () => (
            <AppLayout>
                <Outlet />
            </AppLayout>
        )
    });
    const search = createRoute({
        getParentRoute: () => app,
        path: '/buscar',
        component: SearchFixture,
        validateSearch
    });
    const flow = createRoute({
        getParentRoute: () => app,
        path: '/cursos/$id',
        params: Route.options.params,
        component: Route.options.component,
        validateSearch: validateFlowSearch,
        staticData: Route.options.staticData
    });
    return createRouter({
        isServer,
        routeTree: root.addChildren([app.addChildren([search, flow])]),
        history: createMemoryHistory({ initialEntries: [url] }),
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch
    });
}
describe('fluxograma integrado', () => {
    let client: QueryClient;
    let middleware: Middleware;
    beforeEach(() => {
        width = 390;
        client = new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity, retry: false } }
        });
        client.setQueryData(meQueryOptions.queryKey, user);
        for (const course of courses)
            client.setQueryData(courseQueryOptions(course.id).queryKey, course);
        client.setQueryData(curriculumQueryOptions(42, '2026.2').queryKey, matrix);
        client.setQueryData(allClassroomsQueryOptions.queryKey, [
            {
                id: 'A',
                subject: { code: 'A', name: 'Base' },
                status: 'cursando',
                current: true,
                grade: null
            }
        ]);
        middleware = {
            onRequest: () => Response.json({ detail: 'Indisponível' }, { status: 503 })
        };
        apiClient.use(middleware);
    });
    afterEach(() => {
        testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
    });
    async function renderPage(url = '/cursos/42?materia=A') {
        const router = makeRouter(url);
        await router.load();
        const page = testing.render(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );
        return { ...page, router };
    }
    test('curso abre o fluxo, matéria mantém expansão da main e fechar volta à busca com texto e filtro', async () => {
        const page = await renderPage('/buscar?q=base&category=courses');
        const link = page.getByRole('link', { name: /Curso Teste/ });
        expect(page.queryByRole('link', { name: /A Base/ })).toBeNull();
        expect(page.queryByText('Ver turmas')).toBeNull();
        expect(link.querySelector('button')).toBeNull();
        testing.fireEvent.click(page.getByRole('button', { name: /A Base/ }));
        expect(page.router.state.location.pathname).toBe('/buscar');
        expect(await page.findByRole('button', { name: 'Detalhes da turma 01' })).toBeDefined();
        testing.fireEvent.click(link, { button: 0 });
        await page.findByRole('heading', { name: 'Fluxo acadêmico' });
        expect(page.router.state.location.pathname).toBe('/cursos/42');
        expect(page.router.state.location.search).toEqual({});
        expect(
            page.queryByRole('navigation', { name: 'Navegação principal do aplicativo' })
        ).toBeNull();
        testing.fireEvent.click(page.getByRole('link', { name: 'Voltar' }));
        await testing.waitFor(() => expect(page.router.state.location.pathname).toBe('/buscar'));
        expect(page.router.state.location.search).toMatchObject({
            q: 'base',
            category: 'courses'
        });
    });
    test('hidrata sem divergência e só monta o diagrama após conhecer a largura', async () => {
        const server = makeRouter('/cursos/42?materia=A', true);
        server.ssr = { manifest: undefined };
        await server.load();
        const container = document.createElement('div');
        container.innerHTML = renderToString(
            <QueryClientProvider client={client}>
                <RouterProvider router={server} />
            </QueryClientProvider>
        );
        document.body.append(container);
        expect(container.textContent).toContain('Preparando fluxo');
        expect(container.querySelector('svg[role="img"]')).toBeNull();
        const router = makeRouter('/cursos/42?materia=A');
        router.ssr = { manifest: undefined };
        await router.load();
        const errors: string[] = [];
        const page = testing.render(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>,
            { container, hydrate: true, onRecoverableError: (error) => errors.push(String(error)) }
        );
        await page.findByRole('button', { name: /A, Base, Em curso/ });
        expect(errors).toEqual([]);
        expect(container.querySelectorAll('svg[role="img"]')).toHaveLength(1);
    });
    test('acesso direto volta para busca sem depender do histórico', async () => {
        const page = await renderPage();
        const close = page.getByRole('link', { name: 'Voltar' });
        expect(close.textContent).toBe('');
        testing.fireEvent.click(close);
        await testing.waitFor(() => expect(page.router.state.location.pathname).toBe('/buscar'));
    });
    test('mobile omite legenda, limita semestres reais e troca para um único diagrama no breakpoint', async () => {
        const page = await renderPage();
        await page.findByRole('button', { name: /A, Base, Em curso/ });
        expect(page.queryByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeNull();
        expect(
            page.getByRole('button', { name: 'Semestre anterior' }).hasAttribute('disabled')
        ).toBe(true);
        testing.fireEvent.click(page.getByRole('button', { name: 'Próximo semestre' }));
        await page.findByRole('heading', { name: '2º semestre' });
        expect(
            page.getByRole('button', { name: 'Próximo semestre' }).hasAttribute('disabled')
        ).toBe(true);
        testing.act(() => {
            width = 1024;
            for (const observer of ViewportObserver.active) observer.emit();
        });
        await page.findByRole('region', { name: /Fluxo acadêmico por semestres/ });
        expect(page.getByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeDefined();
        expect(page.queryByRole('button', { name: 'Próximo semestre' })).toBeNull();
        expect(page.getAllByRole('button', { name: /Ver requisitos/ })).toHaveLength(2);
        testing.act(() => {
            width = 1023;
            for (const observer of ViewportObserver.active) observer.emit();
        });
        await page.findByRole('button', { name: 'Próximo semestre' });
        expect(page.queryByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeNull();
    });
    test('mobile mantém todos os semestres e a linha entre eles, rolando suavemente no seletor', async () => {
        const page = await renderPage();
        const region = await page.findByRole('region', { name: /um semestre por vez/ });
        expect(page.getByRole('button', { name: /A, Base, Em curso/ })).toBeDefined();
        expect(page.getByRole('button', { name: /B, Avançada/ })).toBeDefined();
        expect(region.querySelectorAll('[data-edge-id]')).toHaveLength(1);
        const calls: ScrollToOptions[] = [];
        region.scrollTo = (options?: ScrollToOptions | number) => {
            if (typeof options === 'object') calls.push(options);
        };
        testing.fireEvent.click(page.getByRole('button', { name: 'Próximo semestre' }));
        await page.findByRole('heading', { name: '2º semestre' });
        expect(calls).toEqual([{ left: expect.any(Number), behavior: 'smooth' }]);
        expect(calls[0].left).toBeGreaterThan(0);
    });
    test('rolagem horizontal do mobile atualiza o semestre exibido', async () => {
        const page = await renderPage();
        const region = await page.findByRole('region', { name: /um semestre por vez/ });
        await page.findByRole('heading', { name: '1º semestre' });
        region.scrollLeft = 10_000;
        testing.fireEvent.scroll(region);
        await page.findByRole('heading', { name: '2º semestre' });
        expect(
            page.getByRole('button', { name: 'Próximo semestre' }).hasAttribute('disabled')
        ).toBe(true);
    });
    test('mobile abre no semestre da matéria selecionada', async () => {
        const page = await renderPage('/cursos/42?materia=B');
        await page.findByRole('heading', { name: '2º semestre' });
    });
    test('cliques rápidos no seletor avançam um semestre por clique', async () => {
        client.setQueryData(
            curriculumQueryOptions(42, '2026.2').queryKey,
            curriculum({
                ...rawMatrix,
                periods: [
                    ...rawMatrix.periods,
                    { period: 3, subjects: [{ code: 'C', name: 'Final', hours: 30 }] }
                ]
            })
        );
        const page = await renderPage();
        const next = await page.findByRole('button', { name: 'Próximo semestre' });
        testing.act(() => {
            next.click();
            next.click();
        });
        await page.findByRole('heading', { name: '3º semestre' });
        const previous = page.getByRole('button', { name: 'Semestre anterior' });
        testing.act(() => {
            previous.click();
            previous.click();
            previous.click();
        });
        await page.findByRole('heading', { name: '1º semestre' });
    });
    test('mobile abre o curso do aluno no semestre atual sem depender da matéria selecionada', async () => {
        const student: components['schemas']['UserProfile'] = { ...user, entry_semester: '2026.1' };
        client.setQueryData(meQueryOptions.queryKey, student);
        client.setQueryData(curriculumQueryOptions(42, '2026.1').queryKey, matrix);
        const page = await renderPage('/cursos/42');
        await page.findByRole('heading', { name: '2º semestre' });
        testing.fireEvent.click(page.getByRole('button', { name: 'Semestre anterior' }));
        await page.findByRole('heading', { name: '1º semestre' });
        expect(page.getByRole('button', { name: /A, Base, Em curso/ })).toBeDefined();
    });
    test('desktop mantém legenda no cabeçalho ao selecionar matéria que não está em curso', async () => {
        width = 1440;
        const page = await renderPage('/cursos/42?materia=B');
        const diagram = await page.findByRole('region', { name: /Fluxo acadêmico por semestres/ });
        const legend = page.getByRole('list', { name: 'Legenda dos estados acadêmicos' });
        expect(
            legend.compareDocumentPosition(diagram) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
        expect(legend.closest('header')).toBe(
            page.getByRole('heading', { name: 'Fluxo acadêmico' }).closest('header')
        );
        expect(page.getByRole('button', { name: /B, Avançada, Pendente/ })).toBeDefined();
        expect(page.getByRole('button', { name: /A, Base/ }).textContent).toContain('60 h · 4 cr');
        expect(page.getByRole('button', { name: /B, Avançada/ }).textContent).toContain(
            '30 h · 2 cr'
        );
        expect(legend.querySelector('button')).toBeNull();
        expect(page.queryByText(/Matriz Teste/)).toBeNull();
        expect(page.queryByText(/Vigência/)).toBeNull();
    });
    test('desktop mostra todas as linhas e isola temporariamente as relações durante hover', async () => {
        width = 1440;
        client.setQueryData(
            curriculumQueryOptions(42, '2026.2').queryKey,
            curriculum({
                ...rawMatrix,
                periods: [
                    {
                        period: 1,
                        subjects: [
                            { code: 'A', name: 'Base', corequisites: [['C']] },
                            { code: 'C', name: 'Prática' },
                            { code: 'X', name: 'Isolada' }
                        ]
                    },
                    {
                        period: 2,
                        subjects: [
                            { code: 'B', name: 'Avançada', prerequisites: [['A']] },
                            { code: 'Y', name: 'Outra cadeia', prerequisites: [['X']] }
                        ]
                    },
                    { period: 3, subjects: [{ code: 'E', name: 'Final', prerequisites: [['B']] }] }
                ]
            })
        );
        const page = await renderPage('/cursos/42');
        const card = await page.findByRole('button', { name: /B, Avançada/ });
        const edges = () =>
            Array.from(page.container.querySelectorAll('[data-edge-id]'), (element) =>
                element.getAttribute('data-edge-id')
            );
        expect(edges()).toHaveLength(4);
        testing.fireEvent.pointerEnter(card, { pointerType: 'mouse' });
        expect(edges()).toHaveLength(3);
        expect(edges().some((id) => id?.includes(':Y:'))).toBe(false);
        const corequisite = page.container.querySelector(
            '[data-relation="corequisite"] path[marker-start]'
        );
        expect(corequisite?.getAttribute('marker-start')).toBe(
            page.container
                .querySelector('[data-relation="corequisite"] path[marker-end]')
                ?.getAttribute('marker-end')
        );
        expect(corequisite?.getAttribute('stroke')).toBe('currentColor');
        testing.fireEvent.click(card, { button: 0 });
        expect(edges()).toHaveLength(3);
        testing.fireEvent.pointerLeave(card, { pointerType: 'mouse' });
        expect(edges()).toHaveLength(4);
        // o clique abre os detalhes em modal, que deixa o resto inerte
        const other = page.getByRole('button', { name: /X, Isolada/, hidden: true });
        testing.fireEvent.pointerEnter(other, { pointerType: 'mouse' });
        expect(edges()).toHaveLength(1);
        expect(edges()[0]).toContain(':Y:');
        testing.fireEvent.pointerLeave(other, { pointerType: 'mouse' });
        expect(edges()).toHaveLength(4);
        testing.fireEvent.pointerMove(card, { pointerType: 'mouse' });
        expect(edges()).toHaveLength(3);
        testing.fireEvent.pointerCancel(card, { pointerType: 'mouse' });
        expect(edges()).toHaveLength(4);
        testing.fireEvent.pointerEnter(card, { pointerType: 'touch' });
        testing.fireEvent.pointerMove(card, { pointerType: 'touch' });
        expect(edges()).toHaveLength(4);
        testing.fireEvent.pointerEnter(card, { pointerType: 'pen' });
        expect(edges()).toHaveLength(3);
        testing.fireEvent.pointerLeave(card, { pointerType: 'pen' });
        expect(edges()).toHaveLength(4);
        testing.fireEvent.focus(card);
        expect(edges()).toHaveLength(4);
        testing.fireEvent.blur(card);
        expect(edges()).toHaveLength(4);
    });
    test('matéria ausente não modifica a matriz nem exibe legenda no mobile', async () => {
        const page = await renderPage('/cursos/42?materia=OPT');
        await page.findByText(/não pertence aos períodos exibidos/);
        expect(page.queryByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeNull();
        expect(page.queryByRole('button', { name: /OPT,/ })).toBeNull();
    });
    test('falha de histórico mantém matriz e estado desconhecido', async () => {
        client.removeQueries({ queryKey: allClassroomsQueryOptions.queryKey });
        const page = await renderPage();
        await page.findByText(/Histórico indisponível. Os estados/);
        await page.findByRole('button', { name: /A, Base, Histórico indisponível/ });
        expect(page.queryByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeNull();
    });
    test('falha de atualização mantém matriz salva e avisa', async () => {
        const options = curriculumQueryOptions(42, '2026.2');
        client.setQueryData(options.queryKey, matrix, { updatedAt: 1 });
        client.setQueryDefaults(options.queryKey, { staleTime: 0 });
        const page = await renderPage();
        await page.findByText(/Não foi possível atualizar a matriz/);
        expect(page.getByRole('button', { name: /A, Base/ })).toBeDefined();
    });
    test('falha inicial de matriz oferece tentativa e mantém o botão de voltar', async () => {
        client.removeQueries({ queryKey: curriculumQueryOptions(42, '2026.2').queryKey });
        const page = await renderPage();
        await page.findByText('Não foi possível carregar a matriz curricular.');
        expect(page.getByRole('link', { name: 'Voltar' })).toBeDefined();
        expect(page.queryByRole('button', { name: /Ver requisitos/ })).toBeNull();
    });
    test('abre a matriz do outro curso clicado sem aplicar estados do curso do aluno', async () => {
        const semester = getCurrentSemester()!.semester;
        client.setQueryData(curriculumQueryOptions(99, semester).queryKey, {
            ...matrix,
            course_id: 99
        });
        const page = await renderPage('/buscar?q=curso');
        testing.fireEvent.click(page.getByRole('link', { name: /Outro Curso/ }), { button: 0 });
        await page.findByRole('heading', { name: 'OUTRO CURSO' });
        await page.findByRole('button', { name: /A, Base/ });
        expect(page.router.state.location.pathname).toBe('/cursos/99');
        expect(page.router.state.location.search).not.toHaveProperty('curso');
        expect(page.queryByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeNull();
        expect(page.queryByText(/Período atual indisponível/)).toBeNull();
    });
    test('desktop omite legenda e estados nos cards de outro curso', async () => {
        width = 1024;
        const semester = getCurrentSemester()!.semester;
        client.setQueryData(curriculumQueryOptions(99, semester).queryKey, {
            ...matrix,
            course_id: 99
        });
        const page = await renderPage('/cursos/99');
        await page.findByRole('button', { name: 'A, Base. Ver requisitos' });
        expect(page.queryByRole('list', { name: 'Legenda dos estados acadêmicos' })).toBeNull();
        expect(
            page.queryByRole('button', {
                name: /Concluída|Em curso|Pendente|Atrasada|Histórico indisponível/
            })
        ).toBeNull();
    });
    test('visitante abre o curso do catálogo sem exigir login', async () => {
        client.setQueryData(meQueryOptions.queryKey, null);
        const page = await renderPage('/cursos/42');
        await page.findByRole('heading', { name: 'CURSO TESTE' });
        await page.findByRole('button', { name: 'A, Base. Ver requisitos' });
        expect(page.getByRole('button', { name: /A, Base/ }).textContent).toContain(
            '60 h · 4 créditos'
        );
        expect(page.queryByText(/Histórico indisponível/)).toBeNull();
    });
    test('curso fora do catálogo informa que não foi encontrado', async () => {
        apiClient.eject(middleware);
        middleware = {
            onRequest: () => {
                throw toApiError(404, { detail: 'Curso não encontrado.' });
            }
        };
        apiClient.use(middleware);
        const page = await renderPage('/cursos/7');
        await page.findByText('Curso não encontrado no catálogo.');
        expect(page.queryByText('Não foi possível carregar o curso.')).toBeNull();
    });
    test('visitante consegue voltar de um curso acessado diretamente pelo caminho', async () => {
        client.setQueryData(meQueryOptions.queryKey, null);
        const page = await renderPage('/cursos/42');
        await page.findByRole('heading', { name: 'CURSO TESTE' });
        testing.fireEvent.click(page.getByRole('link', { name: 'Voltar' }));
        await testing.waitFor(() => expect(page.router.state.location.pathname).toBe('/buscar'));
    });
});
