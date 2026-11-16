import type { ClassroomPost, TeachingPlan } from '@followw/core/queries/classrooms.ts';
import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach } from 'bun:test';

import { ClassroomPosts } from '#/components/classroom/ClassroomPosts';

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
export const POSTS: ClassroomPost[] = [
    {
        id: 'news:1',
        type: 'news',
        title: 'Aviso da turma',
        attachments: [],
        is_read: false
    }
];

export function useTeachingPlan() {
    const dom = useDom();
    const state = {
        client: new QueryClient(),
        plans: {} as Record<string, TeachingPlan | null>,
        failPlan: false,
        failPosts: false,
        requests: [] as Request[],
        pendingPlan: undefined as Promise<void> | undefined,
        pendingPosts: undefined as Promise<void> | undefined
    };
    let middleware: Middleware;
    beforeEach(() => {
        state.client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: Infinity } }
        });
        state.plans = { AAA: PLAN, BBB: null };
        state.failPlan = false;
        state.failPosts = false;
        state.requests = [];
        state.pendingPlan = undefined;
        state.pendingPosts = undefined;
        middleware = {
            onRequest: async ({ request }) => {
                state.requests.push(request);
                const path = new URL(request.url).pathname;
                if (path.endsWith('/teaching-plan')) {
                    await state.pendingPlan;
                    if (state.failPlan)
                        return Response.json({ detail: 'Indisponível' }, { status: 502 });
                    const id = path.split('/').at(-2) ?? '';
                    return Response.json(state.plans[id] ?? null);
                }
                await state.pendingPosts;
                return state.failPosts
                    ? Response.json({ detail: 'Indisponível' }, { status: 502 })
                    : Response.json(POSTS);
            }
        };
        apiClient.use(middleware);
    });
    afterEach(() => {
        dom.testing.cleanup();
        state.client.clear();
        apiClient.eject(middleware);
    });
    const render = (id = 'AAA') =>
        dom.testing.render(
            <QueryClientProvider client={state.client}>
                <ClassroomPosts key={id} id={id} />
            </QueryClientProvider>
        );
    return { state, dom, render };
}
