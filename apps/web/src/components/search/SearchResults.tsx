import type { SearchResult, SearchType } from '@followw/core/queries/search.ts';

import { searchTypes } from '@followw/core/lib/search-categories.ts';
import { internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import { withClassrooms } from '@followw/core/queries/subjects.ts';
import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment } from 'react';

import { QueryState } from '#/components/QueryState';
import { CourseSection } from '#/components/search/CourseSection';
import { InternshipSection } from '#/components/search/InternshipSection';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { TurmaSection } from '#/components/search/TurmaSection';

/** Cursos, docentes e matérias pedidos em `types` numa só consulta. */
export function SearchResults({
    text,
    types,
    empty,
    currentPeriod,
    taken,
    onShowCategory
}: {
    text: string;
    types: SearchType[] | undefined;
    empty: string;
    currentPeriod: number | null;
    taken: Set<string> | null;
    // na aba Todos, cursos, docentes e estágios viram prévias que levam à aba própria
    onShowCategory?: (category: 'courses' | 'professors' | 'internships') => void;
}) {
    const client = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const options = searchQueryOptions(text, types);
    const result = useQuery({ ...options, placeholderData: keepPreviousData });

    // busca estágios na aba Todos quando autenticado
    const isAll = !types || types.length === 0;
    const { data: internships = [] } = useQuery({
        ...internshipsQueryOptions(text),
        enabled: Boolean(user && isAll),
        placeholderData: keepPreviousData
    });

    // a aba da categoria reaproveita a primeira página já carregada
    const showCategory =
        onShowCategory &&
        ((category: 'courses' | 'professors' | 'internships') => {
            if (category !== 'internships') {
                const data = client.getQueryData<SearchResult>(options.queryKey)?.[category];
                if (data)
                    client.setQueryData(
                        searchQueryOptions(text, searchTypes[category]).queryKey,
                        (old) =>
                            old ?? {
                                subjects: null,
                                courses: null,
                                professors: null,
                                [category]: data
                            }
                    );
            }
            onShowCategory(category);
        });
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
                    const found =
                        courses?.items.length ||
                        professors?.items.length ||
                        offered.length ||
                        internships.length;
                    // nova busca volta os limites de cada seção ao início
                    return found ? (
                        <Fragment key={text}>
                            {courses && (
                                <CourseSection
                                    page={courses}
                                    q={text}
                                    onShowAll={showCategory && (() => showCategory('courses'))}
                                />
                            )}
                            {professors && (
                                <ProfessorSection
                                    page={professors}
                                    q={text}
                                    onShowAll={showCategory && (() => showCategory('professors'))}
                                />
                            )}
                            {internships.length > 0 && (
                                <InternshipSection
                                    internships={internships}
                                    previewLimit={3}
                                    onShowAll={showCategory && (() => showCategory('internships'))}
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
