import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider
} from '@tanstack/react-router';
import { afterEach, expect, test } from 'bun:test';

import type { AcademicState, FlowSubject } from '#/lib/curriculum/types';

import { SubjectDetails } from '#/components/curriculum/SubjectDetails';
import { Dialog } from '#/components/ui/dialog';
import { normalizeCurriculum } from '#/lib/curriculum/model';
import { parseRouterSearch, stringifyRouterSearch, validateSearch } from '#/lib/search-params';

import { curriculum, type RawSubject } from '../../helpers/curriculum';
import { useDom } from '../../helpers/dom';

const dom = useDom();
const matrix = (subject: RawSubject) =>
    curriculum(
        {
            sigaa_id: 1,
            code: '01',
            course_id: 42,
            entry_semester: '2024.2',
            valid_from: '2024.1',
            matrix: 'Teste',
            shift: null,
            periods: [
                {
                    period: 1,
                    subjects: [
                        { code: 'A', name: 'CÁLCULO 1' },
                        { code: 'C', name: 'PROGRAMAÇÃO' }
                    ]
                },
                { period: 2, subjects: [subject] }
            ]
        },
        { EXTERNA: 'ÁLGEBRA LINEAR' }
    );
const flowSubject = (raw: RawSubject): FlowSubject =>
    normalizeCurriculum(matrix(raw)).byCode.get(raw.code)!;
const subject = flowSubject({
    code: 'B',
    name: 'ESTRUTURAS DE DADOS 1',
    prerequisites: [['A', 'EXTERNA'], ['C']],
    equivalences: [['C']]
});
afterEach(() => dom.testing.cleanup());
async function renderDetails(item = subject, state?: AcademicState, unlocks?: FlowSubject[]) {
    const root = createRootRoute({ component: Outlet });
    const flow = createRoute({
        getParentRoute: () => root,
        path: '/cursos/$id',
        component: () => (
            <Dialog>
                <SubjectDetails subject={item} state={state} unlocks={unlocks} />
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
    const page = dom.testing.render(<RouterProvider router={router} />);
    return { ...page, router };
}

test('exibe título sem código e relações apenas pelos nomes do catálogo', async () => {
    const page = await renderDetails(subject, 'enrolled');
    await page.findByText('(Cálculo 1 e Álgebra Linear) ou Programação');
    expect(page.getByRole('heading', { name: 'Estruturas de Dados 1' })).toBeDefined();
    expect(page.getByText('Equivalências')).toBeDefined();
    expect(page.queryByText('Correquisitos')).toBeNull();
    expect(page.container.textContent).not.toContain('fora do fluxo');
    expect(page.container.textContent).not.toContain('Nenhum informado');
    expect(page.container.textContent).not.toContain('As linhas tracejadas');
    expect(page.container.textContent).not.toContain('EXTERNA');
    expect(page.getByRole('button', { name: 'Fechar detalhes da matéria' })).toBeDefined();
});

test('exibe as matérias que ela desbloqueia', async () => {
    const page = await renderDetails(flowSubject({ code: 'A', name: 'CÁLCULO 1' }), undefined, [
        subject,
        flowSubject({ code: 'D', name: 'CÁLCULO 2' })
    ]);
    expect(page.getByText('Desbloqueia')).toBeDefined();
    expect(page.getByText('Estruturas de Dados 1 e Cálculo 2')).toBeDefined();
});

test('oculta seções sem relações ou sem nomes disponíveis no catálogo', async () => {
    const page = await renderDetails(
        flowSubject({
            code: 'B',
            name: 'ESTRUTURAS DE DADOS 1',
            prerequisites: [['DESCONHECIDA']],
            corequisites: [],
            equivalences: null
        })
    );
    expect(page.queryByText('Pré-requisitos')).toBeNull();
    expect(page.queryByText('Correquisitos')).toBeNull();
    expect(page.queryByText('Equivalências')).toBeNull();
    expect(page.queryByText('Desbloqueia')).toBeNull();
    expect(page.container.textContent).not.toContain('DESCONHECIDA');
});

test('exibe somente os requisitos que a API seleciona, como na busca de turmas', async () => {
    const page = await renderDetails(
        flowSubject({
            code: 'B',
            name: 'ESTRUTURAS DE DADOS 1',
            prerequisites: [['A', 'EXTERNA'], ['C']],
            curriculum_prerequisites: [['C']],
            equivalences: [['A'], ['C']],
            offered_equivalences: [['A']]
        })
    );
    expect(page.getByText('Programação')).toBeDefined();
    expect(page.getByText('Cálculo 1')).toBeDefined();
    expect(page.container.textContent).not.toContain('Álgebra Linear');
});

test('avisa quando nenhum requisito está na matriz ou tem turmas', async () => {
    const page = await renderDetails(
        flowSubject({
            code: 'B',
            name: 'ESTRUTURAS DE DADOS 1',
            prerequisites: [['A', 'EXTERNA']],
            curriculum_prerequisites: []
        })
    );
    expect(page.getByText('Pré-requisitos')).toBeDefined();
    expect(
        page.getByText('Nenhuma alternativa na matriz ou com turmas no semestre.')
    ).toBeDefined();
});

test('omite o estado acadêmico ao consultar uma matéria de outro curso', async () => {
    const page = await renderDetails(flowSubject({ code: 'A', name: 'CÁLCULO 1' }));
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
