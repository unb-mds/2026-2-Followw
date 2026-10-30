import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { useOnline } from '#/lib/online';
import { professorSearch, professorsQueryOptions } from '#/queries/professors';

export function ProfessorResults({ text, showEmpty }: { text: string; showEmpty: boolean }) {
    const name = professorSearch(text);
    const online = useOnline();
    const result = useQuery({
        ...professorsQueryOptions(name ?? ''),
        enabled: name != null,
        placeholderData: keepPreviousData
    });
    if (!name)
        return showEmpty ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum docente encontrado. Busque pelo nome.
            </p>
        ) : null;
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-3">
            {result.isPending ? (
                <LoadingText>Buscando docentes...</LoadingText>
            ) : result.isLoadingError ? (
                <ErrorCard
                    message="Não foi possível buscar os docentes."
                    onRetry={() => result.refetch()}
                />
            ) : (
                <>
                    {result.isError && online && (
                        <ErrorCard
                            message="Não foi possível atualizar os docentes. Exibindo os dados salvos."
                            onRetry={() => result.refetch()}
                        />
                    )}
                    <ProfessorSection
                        key={name}
                        professors={result.data?.items ?? []}
                        total={result.data?.total ?? 0}
                    />
                    {!result.data?.items.length && showEmpty && (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum docente encontrado. Tente mudar a busca.
                        </p>
                    )}
                </>
            )}
        </div>
    );
}
