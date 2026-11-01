import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment } from 'react';

import { QueryState } from '#/components/QueryState';
import { CourseSection } from '#/components/search/CourseSection';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { TurmaSection } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';
import { searchQueryOptions } from '#/queries/search';
import { withClassrooms } from '#/queries/subjects';

/** Aba Todos: cursos, docentes e matérias numa só consulta. */
export function SearchResults({
    text,
    currentPeriod,
    taken
}: {
    text: string;
    currentPeriod: number | null;
    taken: Set<string> | null;
}) {
    const client = useQueryClient();
    const result = useQuery({ ...searchQueryOptions(text), placeholderData: keepPreviousData });
    const refresh = () => void refreshQuery(client, searchQueryOptions(text)).catch(noop);
    return (
        <div aria-busy={result.isFetching} className="flex flex-col gap-5">
            <QueryState
                query={result}
                loading="Buscando..."
                error="Não foi possível buscar."
                stale="Não foi possível atualizar a busca. Exibindo os dados salvos."
                className="justify-center"
            >
                {({ courses, professors, subjects }) => {
                    const offered = withClassrooms(subjects ?? []);
                    const found = courses?.length || professors?.items.length || offered.length;
                    // nova busca volta os limites de cada seção ao início
                    return found ? (
                        <Fragment key={text}>
                            <CourseSection courses={courses ?? []} />
                            <ProfessorSection
                                professors={professors?.items ?? []}
                                total={professors?.total ?? 0}
                            />
                            <TurmaSection
                                title="Matérias"
                                subjects={offered}
                                currentPeriod={currentPeriod}
                                taken={taken}
                                onOpenDetails={refresh}
                            />
                        </Fragment>
                    ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            Nenhum resultado encontrado. Tente mudar a busca.
                        </p>
                    );
                }}
            </QueryState>
        </div>
    );
}
