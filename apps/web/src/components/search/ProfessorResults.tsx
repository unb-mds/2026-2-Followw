import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { QueryState } from '#/components/QueryState';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { professorsQueryOptions } from '#/queries/professors';

export function ProfessorResults({ text }: { text: string }) {
    const result = useQuery({
        ...professorsQueryOptions(text),
        placeholderData: keepPreviousData
    });
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-3">
            <QueryState
                query={result}
                loading="Buscando docentes..."
                error="Não foi possível buscar os docentes."
                stale="Não foi possível atualizar os docentes. Exibindo os dados salvos."
            >
                {({ items, total }) =>
                    items.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum docente encontrado. Tente mudar a busca.
                        </p>
                    ) : (
                        <ProfessorSection key={text} professors={items} total={total} />
                    )
                }
            </QueryState>
        </div>
    );
}
