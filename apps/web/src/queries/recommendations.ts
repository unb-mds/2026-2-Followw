import type { CatalogSubject } from '#/queries/subjects';

import { api } from '#/queries/api';

export type Recommendation = NonNullable<CatalogSubject['recommendation']>;

/** Sem filtros, o /public/subjects devolve as recomendações do aluno logado. */
export const recommendationsQueryOptions = api.queryOptions(
    'get',
    '/public/subjects',
    {},
    { staleTime: 0, gcTime: 60_000 }
);

type Reason = Recommendation['reasons'][number];

const plural = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

const reasonLabels: Record<Reason['code'], (value: number) => string> = {
    required: () => 'Obrigatória',
    target_period: () => 'Próximo período do fluxo',
    overdue: () => 'Atrasada no fluxo',
    same_unit: () => 'Da sua unidade',
    chain_length: (value) => `Inicia uma cadeia de ${plural(value, 'semestre', 'semestres')}`,
    chain_width: (value) => `É pré-requisito de ${plural(value, 'disciplina', 'disciplinas')}`,
    hours: (value) => `Carga horária de ${plural(value, 'hora', 'horas')}`
};

export const reasonLabel = (reason: Reason) => reasonLabels[reason.code](reason.value ?? 0);

/** Obrigatórias e optativas sempre mostram só o que o aluno pode cursar, na ordem da API. */
export function showRecommendations(
    user: { level: string } | null | undefined,
    search: { q: string; type: string }
) {
    if (user?.level !== 'Graduação') return false;
    return search.type !== 'all' || !search.q.trim();
}
