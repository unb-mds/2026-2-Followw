import type { InstitutionalEvaluation } from '@followw/core/queries/institutional-evaluations.ts';

import { api } from '@followw/core/queries/api.ts';
import {
    evaluationsQueryOptions,
    questionnaireQueryOptions
} from '@followw/core/queries/institutional-evaluations.ts';
import { useQueryClient } from '@tanstack/react-query';

export function useEvaluationActions(id: number) {
    const queryClient = useQueryClient();
    const questionnaire = questionnaireQueryOptions(id);
    const save = api.useMutation('patch', '/me/institutional-evaluations/{evaluation_id}/draft', {
        networkMode: 'always',
        retry: false,
        onSuccess: (draft) => queryClient.setQueryData(questionnaire.queryKey, draft)
    });
    const submit = api.useMutation('post', '/me/institutional-evaluations/{evaluation_id}/submit', {
        networkMode: 'always',
        retry: false,
        onSuccess: () => {
            queryClient.setQueryData<InstitutionalEvaluation[]>(
                evaluationsQueryOptions.queryKey,
                (items) => items?.filter((item) => item.sigaa_id !== id)
            );
            void queryClient.invalidateQueries({ queryKey: evaluationsQueryOptions.queryKey });
            void queryClient.invalidateQueries({
                queryKey: questionnaire.queryKey,
                refetchType: 'none'
            });
        }
    });
    return { save, submit };
}
