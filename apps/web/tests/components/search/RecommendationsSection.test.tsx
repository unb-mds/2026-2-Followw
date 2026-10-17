import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider, environmentManager } from '@tanstack/react-query';
import {
    RouterProvider,
    createRootRoute,
    createRouter,
    createMemoryHistory
} from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { Recommendations } from '#/queries/recommendations';

import { RecommendationsSection } from '#/components/search/RecommendationsSection';
import { apiClient } from '#/queries/client';
let testing: typeof import('@testing-library/react/pure');
let browser: Window;
const wasServer = environmentManager.isServer();
const previousGlobals = new Map<string, PropertyDescriptor | undefined>();

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
});

afterAll(async () => {
    environmentManager.setIsServer(() => wasServer);
    await browser.happyDOM.abort();
    for (const [key, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

const result: Recommendations = {
    score_version: 'v2',
    total: 1,
    context: {
        offer_semester: '2026.2',
        offer_method: 'latest_listed_snapshot',
        curriculum_selection: 'estimated',
        history_reference_method: 'earliest_own_student_semester',
        course_id: 1,
        unity_id: 1,
        curriculum: {
            id: 'matrix',
            sigaa_id: 1,
            code: '2025',
            valid_from: '2025.1',
            shift: 'DIURNO',
            matrix: 'Engenharia'
        },
        curriculum_method: 'history',
        history_reference: '2025.1',
        period: 3,
        period_method: 'enrolled',
        target_period: 4
    },
    history: {
        sources: ['profile', 'own_student_classrooms', 'grades'],
        profile_synced_at: '',
        classrooms_synced_at: '',
        profile_freshness: 'fresh',
        classrooms_freshness: 'fresh',
        grades: []
    },
    diagnostics: {
        offered_subjects: 1,
        offered_classrooms: 2,
        excluded: {},
        context_state: 'estimated'
    },
    warnings: [{ code: 'offer_snapshot', message: 'Oferta e lotação não são em tempo real.' }],
    items: [
        {
            subject: {
                code: 'FGA0001',
                name: 'Matéria recomendada',
                hours: 60,
                unity_id: 1,
                unity: 'FCTE'
            },
            kind: 'required',
            period: 4,
            score: 90,
            reasons: [
                { code: 'target_period', points: 40 },
                { code: 'required', points: 50 },
                { code: 'unlocks', points: 5 }
            ],
            unlocked_subject_codes: ['FGA0304'],
            equivalent_to: [{ code: 'FGA0002', name: 'Obrigatória pendente' }],
            badges: [],
            classrooms: [
                {
                    id: 'full',
                    sigaa_id: null,
                    number: '01',
                    semester: '2026.2',
                    schedule: '24M12',
                    room: 'S1',
                    professors: null,
                    vacancies: 40,
                    occupied: 40,
                    availability: 'full',
                    is_locked: true
                },
                {
                    id: 'unknown',
                    sigaa_id: null,
                    number: '02',
                    semester: '2026.2',
                    schedule: null,
                    room: null,
                    professors: null,
                    vacancies: null,
                    occupied: null,
                    availability: 'unknown',
                    is_locked: false
                }
            ]
        }
    ]
};

describe('seção de recomendações', () => {
    let client: QueryClient;
    let middleware: Middleware;
    let response: () => Response | Promise<Response>;
    let requests: Request[];
    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        requests = [];
        response = () => Response.json(result);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                if (new URL(request.url).pathname.endsWith('/public/subjects')) {
                    return Response.json([
                        {
                            ...result.items[0].subject,
                            prerequisites: [
                                [
                                    {
                                        code: 'MAT0001',
                                        subject: { code: 'MAT0001', name: 'Requisito do catálogo' }
                                    }
                                ]
                            ],
                            classrooms: result.items[0].classrooms.map((classroom) => ({
                                ...classroom,
                                professors: classroom.professors ?? []
                            }))
                        }
                    ]);
                }
                return response();
            }
        };
        apiClient.use(middleware);
    });
    afterEach(() => {
        testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
    });
    const renderSection = async () => {
        const root = createRootRoute({ component: RecommendationsSection });
        const router = createRouter({
            routeTree: root,
            history: createMemoryHistory({ initialEntries: ['/'] })
        });
        await router.load();
        return testing.render(
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        );
    };
    test('mantém o cabeçalho padrão sem score e exibe motivos e turmas nos detalhes', async () => {
        const page = await renderSection();
        await testing.waitFor(() =>
            expect(page.getByRole('button', { name: /FGA0001/ })).toBeDefined()
        );
        expect(page.getByRole('button', { name: /FGA0001/ }).textContent).toContain('2 turmas');
        expect(page.queryByText('90 pontos')).toBeNull();
        expect(
            page.getByText(/As sugestões consideram sua matriz, histórico e pré-requisitos/)
        ).toBeDefined();
        expect(page.queryByText('Oferta e lotação não são em tempo real.')).toBeNull();
        expect(page.queryByRole('button', { name: 'Atualizar recomendações' })).toBeNull();
        testing.fireEvent.click(page.getByRole('button', { name: /FGA0001/ }));
        await testing.waitFor(() =>
            expect(page.getByRole('list', { name: 'Critérios atendidos' })).toBeDefined()
        );
        const criteria = page.getByRole('list', { name: 'Critérios atendidos' });
        expect(Array.from(criteria.querySelectorAll('li'), (item) => item.textContent)).toEqual([
            'Obrigatória',
            'Próximo período do fluxo',
            'Desbloqueia disciplinas'
        ]);
        expect(page.queryByText(/\+\d+/)).toBeNull();
        expect(page.queryByText(/Desbloqueia:/)).toBeNull();
        expect(page.queryByText(/FGA0304/)).toBeNull();
        expect(page.getByText(/Equivalência a: FGA0002/)).toBeDefined();
        await testing.waitFor(() =>
            expect(page.getAllByRole('button', { name: 'Matéria recomendada' })).toHaveLength(2)
        );
        const classrooms = page.getAllByRole('button', {
            name: 'Matéria recomendada'
        });
        expect(
            criteria.compareDocumentPosition(classrooms[1]) & Node.DOCUMENT_POSITION_PRECEDING
        ).not.toBe(0);
        expect(page.queryByText('Vagas não informadas')).toBeNull();
        expect(classrooms[0].getAttribute('aria-haspopup')).toBe('dialog');
        const previousRequests = requests.length;
        testing.fireEvent.click(classrooms[0]);
        await testing.waitFor(() =>
            expect(classrooms[0].getAttribute('aria-expanded')).toBe('true')
        );
        await testing.waitFor(() => expect(requests.length).toBe(previousRequests + 1));
        const catalogRequest = new URL(requests.at(-1)!.url);
        expect(catalogRequest.searchParams.get('code')).toBe('FGA0001');
        expect(catalogRequest.searchParams.get('semester')).toBe('2026.2');
        expect(page.queryByRole('link', { name: 'Consultar turmas e requisitos' })).toBeNull();
    });
    test('erro inicial permite tentar novamente', async () => {
        response = () => Response.json({ detail: 'Indisponível' }, { status: 503 });
        const page = await renderSection();
        await testing.waitFor(() =>
            expect(page.getByText('Não foi possível carregar suas recomendações.')).toBeDefined()
        );
        response = () => Response.json(result);
        testing.fireEvent.click(page.getByRole('button', { name: 'Tentar novamente' }));
        await testing.waitFor(() =>
            expect(page.getByRole('button', { name: /FGA0001/ })).toBeDefined()
        );
    });
    test('carregamento não apresenta resultado vazio antes da resposta', async () => {
        let resolve!: (value: Response) => void;
        response = () =>
            new Promise((done) => {
                resolve = done;
            });
        const page = await renderSection();
        await testing.waitFor(() =>
            expect(page.getByText('Buscando recomendações...')).toBeDefined()
        );
        expect(page.queryByText(/Nenhuma matéria elegível/)).toBeNull();
        await testing.act(async () => resolve(Response.json({ ...result, items: [], total: 0 })));
        await testing.waitFor(() =>
            expect(page.getByText(/Nenhuma matéria elegível/)).toBeDefined()
        );
    });
    test('matriz ausente tem mensagem específica sem sugerir módulo livre', async () => {
        response = () =>
            Response.json({
                ...result,
                items: [],
                total: 0,
                context: { ...result.context, curriculum: null }
            });
        const page = await renderSection();
        await testing.waitFor(() =>
            expect(page.getByText(/Não foi possível identificar sua matriz/)).toBeDefined()
        );
    });
});
