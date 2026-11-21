import type { Classroom, TeachingPlan } from '@followw/core/queries/classrooms.ts';

import {
    RouterContextProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter
} from '@tanstack/react-router';
import { afterEach } from 'bun:test';

import { ClassroomTeachingPlanPage } from '#/components/classroom/ClassroomTeachingPlanPage';
import { TeachingPlanLink } from '#/components/classroom/TeachingPlanLink';

import { useDom } from '../../../helpers/dom';

export const PLAN: TeachingPlan = {
    methodology:
        'Aulas **práticas**.\n\n1. Grupos\n2. Anéis\n\n[Leitura](https://example.org/livro)\n\n| Tema | Capítulo |\n| --- | --- |\n| Grupos | 1 |',
    assessment_procedures: 'Média das três provas.',
    office_hours: null,
    schedule: [
        { start_date: '2026-11-03', end_date: '2026-11-26', description: 'Material A3' },
        { start_date: '2026-08-11', end_date: '2026-09-17', description: 'Material A1' }
    ],
    assessments: [{ date: '2026-10-29', description: 'Avaliação A2' }],
    basic_references: [
        { material_type: 'Outros', description: 'Introdução à Álgebra.' },
        { material_type: 'Outros', description: 'Introdução à Álgebra.' }
    ],
    complementary_references: []
};

export const CLASSROOM: Classroom = {
    id: 'AAA',
    sigaa_id: 1,
    number: '02',
    semester: '2026.2',
    schedule: null,
    room: null,
    current: true,
    subject: { code: 'FGA0108', name: 'MATEMÁTICA DISCRETA 2', hours: 60, unit: null },
    professors: [],
    has_teaching_plan: true
};

export function createPlanRouter(initialEntries = ['/turmas/AAA/plano-de-ensino']) {
    const root = createRootRoute();
    return createRouter({
        routeTree: root.addChildren([
            createRoute({ getParentRoute: () => root, path: '/turmas/$id' }),
            createRoute({ getParentRoute: () => root, path: '/turmas/$id/plano-de-ensino' })
        ]),
        history: createMemoryHistory({ initialEntries })
    });
}

export function useTeachingPlan() {
    const dom = useDom();
    afterEach(() => dom.testing.cleanup());
    const render = (children: React.ReactNode, router = createPlanRouter()) =>
        dom.testing.render(
            <RouterContextProvider router={router}>{children}</RouterContextProvider>
        );
    return {
        dom,
        renderPage: (plan = PLAN, router?: ReturnType<typeof createPlanRouter>) =>
            render(<ClassroomTeachingPlanPage classroom={CLASSROOM} plan={plan} />, router),
        renderLink: () => render(<TeachingPlanLink id="AAA" />)
    };
}
