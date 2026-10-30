import type { Middleware } from 'openapi-fetch';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider
} from '@tanstack/react-router';
import { afterEach, beforeEach, expect, test } from 'bun:test';

import type { AcademicState, CurriculumModel, FlowSubject } from '#/lib/curriculum/model';

import { SubjectDetails } from '#/components/curriculum/SubjectDetails';
import { Dialog } from '#/components/ui/dialog';
import { parseRouterSearch, stringifyRouterSearch, validateSearch } from '#/lib/search-params';
import { apiClient } from '#/queries/client';

import { useDom } from '../../helpers/dom';

const dom = useDom();
const base: FlowSubject = { code: 'A', name: 'CÁLCULO 1', period: 1 };
const other: FlowSubject = { code: 'C', name: 'PROGRAMAÇÃO', period: 1 };
const subject: FlowSubject = {
    code: 'B',
    name: 'ESTRUTURAS DE DADOS 1',
    period: 2,
    prerequisites: [['A', 'EXTERNA'], ['C']],
    equivalences: [['C']]
};
const model: CurriculumModel = {
    subjects: [base, other, subject],
    periods: [1, 2],
    byCode: new Map([base, other, subject].map((item) => [item.code, item])),
    edges: []
};
let client: QueryClient;
let middleware: Middleware;
let requests: string[];
beforeEach(() => {
    client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } }
    });
    requests = [];
    middleware = {
        onRequest: ({ request }) => {
            const code = new URL(request.url).searchParams.get('code')!;
            requests.push(code);
            return Response.json(
                code === 'EXTERNA' ? [{ code, name: 'ÁLGEBRA LINEAR', classrooms: [] }] : []
            );
        }
    };
    apiClient.use(middleware);
});
afterEach(() => {
    dom.testing.cleanup();
    client.clear();
    apiClient.eject(middleware);
});
async function renderDetails(item = subject, state: AcademicState | null = 'enrolled') {
    const root = createRootRoute({ component: Outlet });
    const flow = createRoute({
        getParentRoute: () => root,
        path: '/cursos/$id',
        component: () => (
            <Dialog>
                <SubjectDetails subject={item} model={model} state={state} />
            </Dialog>
        )
    });
    const search = createRoute({
        getParentRoute: () => root,
        path: '/buscar',
        validateSearch,
        component: () => <p>Resultados das turmas</p>
    });
    const router = createRouter({
        routeTree: root.addChildren([flow, search]),
        history: createMemoryHistory({
            initialEntries: ['/cursos/42?category=courses&q=original']
        }),
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch
    });
    await router.load();
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );
    return { ...page, router };
}

test('exibe título sem código, relações apenas por nomes e consulta componentes fora da matriz', async () => {
    const page = await renderDetails();
    await page.findByText('(Cálculo 1 e Álgebra Linear) ou Programação');
    expect(page.getByRole('heading', { name: 'Estruturas de Dados 1' })).toBeDefined();
    expect(page.getByText('Equivalências')).toBeDefined();
    expect(page.queryByText('Correquisitos')).toBeNull();
    expect(page.container.textContent).not.toContain('fora do fluxo');
    expect(page.container.textContent).not.toContain('Nenhum informado');
    expect(page.container.textContent).not.toContain('As linhas tracejadas');
    expect(page.container.textContent).not.toContain('EXTERNA');
    expect(requests).toEqual(['EXTERNA']);
    expect(page.getByRole('button', { name: 'Fechar detalhes da matéria' })).toBeDefined();
});

test('oculta seções sem relações ou sem nomes disponíveis no catálogo', async () => {
    const page = await renderDetails({
        ...subject,
        prerequisites: [['DESCONHECIDA']],
        corequisites: [],
        equivalences: null
    });
    await dom.testing.waitFor(() =>
        expect(page.queryByText('Carregando relações...') === null).toBe(true)
    );
    expect(page.queryByText('Pré-requisitos')).toBeNull();
    expect(page.queryByText('Correquisitos')).toBeNull();
    expect(page.queryByText('Equivalências')).toBeNull();
    expect(page.container.textContent).not.toContain('DESCONHECIDA');
});

test('omite o estado acadêmico ao consultar uma matéria de outro curso', async () => {
    const page = await renderDetails(base, null);
    expect(page.getByText('1º semestre')).toBeDefined();
    expect(page.container.textContent).not.toMatch(
        /Concluída|Em curso|Pendente|Atrasada|Histórico indisponível/
    );
});

test('visualizar turmas abre a busca pelo código da matéria sem herdar o filtro anterior', async () => {
    const page = await renderDetails();
    const link = page.getByRole('link', { name: 'Visualizar turmas' });
    expect(link.classList.contains('bg-primary')).toBe(true);
    dom.testing.fireEvent.click(link, { button: 0 });
    await dom.testing.waitFor(() => expect(page.router.state.location.pathname).toBe('/buscar'));
    expect(page.router.state.location.search).toEqual({ q: 'B', category: 'classrooms' });
    expect(page.queryByRole('link', { name: 'Visualizar turmas' })).toBeNull();
});
