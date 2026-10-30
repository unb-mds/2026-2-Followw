import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';

import type { SubjectsQuery } from '#/queries/subjects';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { TurmaSection } from '#/components/search/TurmaSection';
import { useOnline } from '#/lib/online';
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
    const online = useOnline();
    const result = useQuery({ ...subjectsQueryOptions(query), placeholderData: keepPreviousData });
    const subjects = withClassrooms(result.data ?? []);
    const refresh = () => void refreshQuery(client, subjectsQueryOptions(query)).catch(noop);
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-5">
            {result.isPending ? (
                <LoadingText className="justify-center">Buscando matérias...</LoadingText>
            ) : result.isLoadingError ? (
                <ErrorCard
                    message="Não foi possível buscar as matérias."
                    onRetry={() => result.refetch()}
                />
            ) : (
                <>
                    {result.isError && online && (
                        <ErrorCard
                            message="Não foi possível atualizar as matérias. Exibindo os dados salvos."
                            onRetry={() => result.refetch()}
                        />
                    )}
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
            )}
        </div>
    );
}
