import type { PlannedClass } from '@followw/core/lib/planned-schedule.ts';

import { ApiError } from '@followw/core/queries/errors.ts';
import { type SubjectsQuery, subjectsQueryOptions } from '@followw/core/queries/subjects.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';

import { QueryState } from '#/components/QueryState';
import { SubjectPageSection } from '#/components/search/SubjectPageSection';
import { TurmaSectionSkeleton } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';

export function SubjectResults({
    query,
    title,
    currentPeriod,
    planned,
    availability,
    taken
}: {
    query: SubjectsQuery;
    title: string;
    currentPeriod: number | null;
    planned?: readonly PlannedClass[];
    availability?: Set<string> | null;
    taken: Set<string> | null;
}) {
    const client = useQueryClient();
    const options = subjectsQueryOptions(query);
    const result = useQuery(options);
    const error: unknown = result.error;
    const refresh = () => void refreshQuery(client, options).catch(noop);
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-5">
            <QueryState
                query={result}
                loading="Buscando matérias..."
                error={
                    query.kind?.length && error instanceof ApiError && error.isNotFound
                        ? 'Matriz curricular não encontrada para filtrar por tipo de matéria.'
                        : 'Não foi possível buscar as matérias.'
                }
                stale="Não foi possível atualizar as matérias. Exibindo os dados salvos."
                skeleton={<TurmaSectionSkeleton title />}
            >
                {(data) => (
                    <SubjectPageSection
                        key={JSON.stringify(query)}
                        first={data}
                        query={query}
                        title={title}
                        currentPeriod={currentPeriod}
                        planned={planned}
                        availability={availability}
                        taken={taken}
                        refreshFirst={refresh}
                        empty="Nenhuma matéria encontrada. Tente mudar a busca."
                    />
                )}
            </QueryState>
        </div>
    );
}
