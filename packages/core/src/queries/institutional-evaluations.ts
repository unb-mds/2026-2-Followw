import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type InstitutionalQuestionnaire = components['schemas']['InstitutionalQuestionnaire'];
export type InstitutionalEvaluation = components['schemas']['InstitutionalEvaluation'];
export type EvaluationChoice = components['schemas']['InstitutionalEvaluationChoice'];
export type EvaluationAnswers = NonNullable<components['schemas']['EvaluationAnswers']['answers']>;

const privateQuery = {
    meta: { persist: false },
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false
};

export const evaluationsQueryOptions = api.queryOptions(
    'get',
    '/me/institutional-evaluations',
    {},
    privateQuery
);

export const questionnaireQueryOptions = (evaluationId: number) =>
    api.queryOptions(
        'get',
        '/me/institutional-evaluations/{evaluation_id}',
        { params: { path: { evaluation_id: evaluationId } } },
        privateQuery
    );
