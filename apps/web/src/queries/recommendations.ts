import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type Recommendation = components['schemas']['Recommendation'];
export type Recommendations = components['schemas']['Recommendations'];

export const recommendationsQueryOptions = api.queryOptions(
    'get',
    '/me/recommendations',
    {},
    { staleTime: 0, gcTime: 60_000 }
);

export const recommendationReasonLabels: Record<Recommendation['reasons'][number]['code'], string> =
    {
        required: 'Obrigatória',
        target_period: 'Próximo período do fluxo',
        same_unity: 'Da sua unidade',
        unlocks: 'Desbloqueia disciplinas',
        overdue: 'Atrasada no fluxo',
        equivalent: 'Substitui obrigatória pendente',
        optional: 'Optativa'
    };

export function showRecommendations(
    user: { level: string } | null | undefined,
    search: { q: string; turno: string; disponibilidade: string }
) {
    return (
        user?.level === 'Graduação' &&
        !search.q.trim() &&
        search.turno === 'Todos' &&
        search.disponibilidade === 'Todas'
    );
}
