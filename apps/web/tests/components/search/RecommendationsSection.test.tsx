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
import { renderToStaticMarkup } from 'react-dom/server';

import type { CatalogSubject } from '#/queries/subjects';

import {
    RecommendationReasons,
    RecommendationsSection
} from '#/components/search/RecommendationsSection';
import { apiClient } from '#/queries/client';
import { meQueryOptions } from '#/queries/me';
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

const result: CatalogSubject[] = [
    {
        code: 'FGA0001',
        name: 'Matéria recomendada',
        hours: 60,
        unit: { id: 673, code: 'FCTE', name: 'CAMPUS UNB GAMA' },
        prerequisites: [
            [{ code: 'MAT0001', subject: { code: 'MAT0001', name: 'Requisito do catálogo' } }]
        ],
        corequisites: null,
        equivalences: null,
        kind: 'mandatory',
        recommendation: {
            reasons: [
                { code: 'target_period' },
                { code: 'required' },
                { code: 'chain_width', value: 2 },
                { code: 'chain_length', value: 1 },
                { code: 'hours', value: 60 }
            ]
        },
        classrooms: [
            {
                sigaa_id: null,
                number: '01',
                semester: '2026.2',
                schedule: '24M12',
                room: 'S1',
                professors: [],
                vacancies: 40,
                occupied: 40
            },
            {
                sigaa_id: null,
                number: '02',
                semester: '2026.2',
                schedule: null,
                room: null,
                professors: [],
                vacancies: null,
                occupied: null
            }
        ]
    }
];

describe('seção de recomendações', () => {
    let client: QueryClient;
    let middleware: Middleware;
    let response: () => Response | Promise<Response>;
    let requests: Request[];
    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        client.setQueryData(meQueryOptions.queryKey, null);
        requests = [];
        response = () => Response.json(result);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
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
    const renderSection = async (
        props: React.ComponentProps<typeof RecommendationsSection> = {}
    ) => {
        const root = createRootRoute({ component: () => <RecommendationsSection {...props} /> });
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
    test('busca as matérias sem filtros e exibe motivos e turmas nos detalhes', async () => {
        const page = await renderSection();
        await testing.waitFor(() =>
            expect(page.getByRole('button', { name: /FGA0001/ })).toBeDefined()
        );
        const request = new URL(requests[0].url);
        expect(request.pathname.endsWith('/public/subjects')).toBe(true);
        expect([...request.searchParams]).toEqual([]);
        expect(page.getByRole('button', { name: /FGA0001/ }).textContent).toContain('2 turmas');
        expect(page.getByRole('button', { name: /FGA0001/ }).textContent).toContain('Obrigatória');
        expect(page.queryByText('104 pontos')).toBeNull();
        testing.fireEvent.click(page.getByRole('button', { name: /FGA0001/ }));
        await testing.waitFor(() =>
            expect(page.getByRole('button', { name: 'Por que esta matéria?' })).toBeDefined()
        );
        expect(page.queryByRole('list', { name: 'Critérios atendidos' })).toBeNull();
        const classrooms = page.getAllByRole('button', { name: /^Detalhes da turma/ });
        expect(classrooms).toHaveLength(2);
        testing.fireEvent.click(page.getByRole('button', { name: 'Por que esta matéria?' }), {
            button: 0
        });
        expect(
            page
                .getByRole('button', { name: 'Por que esta matéria?' })
                .getAttribute('aria-expanded')
        ).toBe('true');
        const criteria = document.createElement('div');
        criteria.innerHTML = renderToStaticMarkup(<RecommendationReasons subject={result[0]} />);
        expect(Array.from(criteria.querySelectorAll('li'), (item) => item.textContent)).toEqual([
            'Próximo período do fluxo',
            'Obrigatória',
            'É pré-requisito de 2 disciplinas',
            'Inicia uma cadeia de 1 semestre',
            'Carga horária de 60 horas'
        ]);
        expect(classrooms[0].getAttribute('aria-haspopup')).toBe('dialog');
        testing.fireEvent.click(classrooms[0]);
        await testing.waitFor(() =>
            expect(classrooms[0].getAttribute('aria-expanded')).toBe('true')
        );
        expect(requests).toHaveLength(1);
    });
    test('abas de tipo mostram só as recomendações do tipo', async () => {
        response = () =>
            Response.json([
                result[0],
                { ...result[0], code: 'FGA0002', name: 'Optativa da manhã', kind: 'optional' },
                {
                    ...result[0],
                    code: 'FGA0003',
                    name: 'Optativa da noite',
                    kind: 'optional'
                }
            ]);
        const page = await renderSection({ type: 'optional' });
        await testing.waitFor(() =>
            expect(page.getByRole('button', { name: /FGA0002/ })).toBeDefined()
        );
        expect(page.getByRole('region', { name: 'Optativas disponíveis' })).toBeDefined();
        expect(page.getByRole('button', { name: /FGA0003/ })).toBeDefined();
        expect(page.queryByRole('button', { name: /FGA0001/ })).toBeNull();
    });
    test('aba sem recomendações do tipo avisa que nada está disponível', async () => {
        const page = await renderSection({ type: 'optional' });
        await testing.waitFor(() =>
            expect(page.getByText(/Nenhuma matéria disponível para você/)).toBeDefined()
        );
    });
    test('exibe 20 recomendações e carrega mais sob demanda', async () => {
        response = () =>
            Response.json(
                Array.from({ length: 25 }, (_, index) => ({
                    ...result[0],
                    code: `FGA${String(index).padStart(4, '0')}`
                }))
            );
        const page = await renderSection();
        const items = () => page.container.querySelectorAll('[data-slot="accordion-item"]');
        await testing.waitFor(() => expect(items()).toHaveLength(20));
        testing.fireEvent.click(page.getByRole('button', { name: 'Mostrar mais' }));
        expect(items()).toHaveLength(25);
        expect(page.queryByRole('button', { name: 'Mostrar mais' })).toBeNull();
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
        expect(page.queryByText(/Nenhuma matéria da oferta/)).toBeNull();
        await testing.act(async () => resolve(Response.json([])));
        await testing.waitFor(() =>
            expect(page.getByText(/Nenhuma matéria da oferta/)).toBeDefined()
        );
    });
});
