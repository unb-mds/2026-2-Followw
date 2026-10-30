import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SubjectsQuery } from '#/queries/subjects';

import { QueryState } from '#/components/QueryState';
import { TurmaSection } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';
import { subjectsQueryOptions, withClassrooms } from '#/queries/subjects';

export function SubjectResults({
    query,
    currentPeriod,
    taken
}: {
    query: SubjectsQuery;
    currentPeriod: number | null;
    taken: Set<string> | null;
}) {
    const client = useQueryClient();
    const result = useQuery({ ...subjectsQueryOptions(query), placeholderData: keepPreviousData });
    const refresh = () => void refreshQuery(client, subjectsQueryOptions(query)).catch(noop);
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-5">
            <QueryState
                query={result}
                loading="Buscando matérias..."
                error="Não foi possível buscar as matérias."
                stale="Não foi possível atualizar as matérias. Exibindo os dados salvos."
                className="justify-center"
            >
                {(data) => {
                    const subjects = withClassrooms(data);
                    return (
                        <>
                            <TurmaSection
                                key={JSON.stringify(query)}
                                title={query.unit ? `Matérias da ${query.unit}` : 'Matérias'}
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
