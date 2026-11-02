import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment } from 'react';

import type { SearchType } from '#/queries/search';

import { QueryState } from '#/components/QueryState';
import { CourseSection } from '#/components/search/CourseSection';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { TurmaSection } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';
import { searchQueryOptions } from '#/queries/search';
import { withClassrooms } from '#/queries/subjects';

/** Cursos, docentes e matérias pedidos em `types` numa só consulta. */
export function SearchResults({
    text,
    types,
    empty,
    currentPeriod,
    taken
}: {
    text: string;
    types: SearchType[] | undefined;
    empty: string;
    currentPeriod: number | null;
    taken: Set<string> | null;
}) {
    const client = useQueryClient();
    const options = searchQueryOptions(text, types);
    const result = useQuery({ ...options, placeholderData: keepPreviousData });
    const refresh = () => void refreshQuery(client, options).catch(noop);
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
                            {courses && <CourseSection courses={courses} />}
                            {professors && (
                                <ProfessorSection
                                    professors={professors.items}
                                    total={professors.total}
                                />
                            )}
                            <TurmaSection
                                title="Matérias"
                                subjects={offered}
                                currentPeriod={currentPeriod}
                                taken={taken}
                                onOpenDetails={refresh}
                            />
                        </Fragment>
                    ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>
                    );
                }}
            </QueryState>
        </div>
    );
}
