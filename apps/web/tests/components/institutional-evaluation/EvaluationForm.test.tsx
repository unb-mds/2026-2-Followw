import type { InstitutionalQuestionnaire } from '@followw/core/queries/institutional-evaluations.ts';
import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { questionnaireQueryOptions } from '@followw/core/queries/institutional-evaluations.ts';
import { QueryClient, QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query';
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRouter
} from '@tanstack/react-router';
import { afterAll, beforeAll, expect, test } from 'bun:test';

import { mockBrowserLayoutEffect } from '../../helpers/base-ui';
import { useDom } from '../../helpers/dom';

const dom = useDom();
let EvaluationForm: typeof import('#/components/institutional-evaluation/EvaluationForm').EvaluationForm;
let restore: (() => Promise<void>) | undefined;
beforeAll(async () => {
    restore = await mockBrowserLayoutEffect();
    ({ EvaluationForm } = await import('#/components/institutional-evaluation/EvaluationForm'));
});
afterAll(async () => {
    await restore?.();
});

function questionnaire(answer: string | null): InstitutionalQuestionnaire {
    return {
        evaluation: {
            sigaa_id: 7,
            semester: '2026.2',
            title: 'Avaliação da docência',
            respondent_profile: 'Graduação',
            distance_learning: false,
            response_starts_on: '2026-11-19',
            response_ends_on: '2027-01-31'
        },
        instructions: null,
        targets: [
            {
                classroom_sigaa_id: 12,
                classroom_label: 'FGA0001 - T01',
                instructor: 'Docente de teste',
                questions: [
                    {
                        prompt: 'O plano de ensino foi apresentado?',
                        field: 'p_1_1',
                        choices: [{ value: '9', label: '9' }],
                        options: ['9'],
                        answer
                    }
                ]
            }
        ],
        comments: []
    };
}

test('salva somente as edições e exige confirmação antes de enviar', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    const options = questionnaireQueryOptions(7);
    client.setQueryData(options.queryKey, questionnaire(null));

    const writes: { method: string; body: unknown }[] = [];
    const middleware: Middleware = {
        onRequest: async ({ request }) => {
            writes.push({ method: request.method, body: await request.json() });
            if (request.method === 'PATCH') {
                expect(new URL(request.url).pathname).toEndWith('/7/draft');
                return Response.json(questionnaire('9'));
            }
            expect(new URL(request.url).pathname).toEndWith('/7/submit');
            return Response.json({ confirmation: 'Avaliação finalizada com sucesso.' });
        }
    };
    apiClient.use(middleware);

    const router = createRouter({
        routeTree: createRootRoute({
            component: () => {
                const { data } = useSuspenseQuery(options);
                return <EvaluationForm questionnaire={data} onCheck={async () => true} />;
            }
        }),
        history: createMemoryHistory()
    });
    await router.load();
    const page = dom.testing.render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>
    );

    try {
        dom.testing.fireEvent.change(page.getByLabelText('O plano de ensino foi apresentado?'), {
            target: { value: '9' }
        });
        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Salvar rascunho' }));
        expect(await page.findByText('Rascunho salvo no SIGAA')).toBeTruthy();
        expect(writes).toEqual([{ method: 'PATCH', body: { answers: { p_1_1: '9' } } }]);

        dom.testing.fireEvent.click(page.getByRole('button', { name: 'Enviar avaliação' }));
        const dialog = await page.findByRole('alertdialog', { name: 'Enviar avaliação?' });
        expect(writes).toHaveLength(1);
        dom.testing.fireEvent.click(
            dom.testing.within(dialog).getByRole('button', { name: 'Confirmar envio' })
        );
        expect(await page.findByText('Avaliação enviada')).toBeTruthy();
        expect(page.getByRole('link', { name: 'Voltar às avaliações' }).getAttribute('href')).toBe(
            '/avaliacao-institucional?view=list'
        );
        expect(writes[1]).toEqual({ method: 'POST', body: { answers: {} } });
    } finally {
        page.unmount();
        client.clear();
        apiClient.eject(middleware);
    }
});
