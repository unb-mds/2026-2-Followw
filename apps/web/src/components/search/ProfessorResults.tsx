import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { QueryState } from '#/components/QueryState';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { professorSearch, professorsQueryOptions } from '#/queries/professors';

export function ProfessorResults({ text, showEmpty }: { text: string; showEmpty: boolean }) {
    const name = professorSearch(text);
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
            <QueryState
                query={result}
                loading="Buscando docentes..."
                error="Não foi possível buscar os docentes."
                stale="Não foi possível atualizar os docentes. Exibindo os dados salvos."
            >
                {({ items, total }) => (
                    <>
                        <ProfessorSection key={name} professors={items} total={total} />
                        {!items.length && showEmpty && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                Nenhum docente encontrado. Tente mudar a busca.
                            </p>
                        )}
                    </>
                )}
            </QueryState>
        </div>
    );
}
