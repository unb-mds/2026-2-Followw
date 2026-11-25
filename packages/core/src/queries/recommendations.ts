import type { CatalogSubject } from './subjects.ts';

import { api } from './api.ts';

export type Recommendation = NonNullable<CatalogSubject['recommendation']>;

/** Com `available`, só turmas com vaga e pré-requisitos cumpridos. Dependem do histórico do momento e não vão para o disco. */
export const recommendationsQueryOptions = (available = false) =>
    api.queryOptions(
        'get',
        '/public/subjects/recommendations',
        available ? { params: { query: { available } } } : {},
        { staleTime: 0, gcTime: 60_000, meta: { persist: false } }
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

/** Sem texto, as abas mostram só o que o aluno pode cursar; com busca, toda a oferta. */
export function showRecommendations(
    user: { level: string } | null | undefined,
    search: { q: string }
) {
    return user?.level === 'Graduação' && !search.q.trim();
}
