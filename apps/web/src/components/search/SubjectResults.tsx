import { ApiError } from '@followw/core/queries/errors.ts';
import {
    type SubjectsQuery,
    subjectsQueryOptions,
    withClassrooms
} from '@followw/core/queries/subjects.ts';
import { noop, useQuery, useQueryClient } from '@tanstack/react-query';

import { QueryState } from '#/components/QueryState';
import { TurmaSection, TurmaSectionSkeleton } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';

export function SubjectResults({
    query,
    title,
    currentPeriod,
    taken
}: {
    query: SubjectsQuery;
    title: string;
    currentPeriod: number | null;
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
                    query.electives && error instanceof ApiError && error.isNotFound
                        ? 'Matriz curricular não encontrada para identificar as optativas e os módulos livres.'
                        : 'Não foi possível buscar as matérias.'
                }
                stale="Não foi possível atualizar as matérias. Exibindo os dados salvos."
                skeleton={<TurmaSectionSkeleton title />}
            >
                {(data) => {
                    const subjects = withClassrooms(data, taken);
                    return (
                        <>
                            <TurmaSection
                                key={JSON.stringify(query)}
                                title={title}
                                subjects={subjects}
                                currentPeriod={currentPeriod}
                                taken={taken}
                                onOpenDetails={refresh}
                            />
                            {subjects.length === 0 && (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Nenhuma matéria encontrada. Tente mudar a busca.
                                </p>
                            )}
                        </>
                    );
                }}
            </QueryState>
        </div>
    );
}
