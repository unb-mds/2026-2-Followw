import type { SearchResult, SearchType } from '@followw/core/queries/search.ts';

import { searchTypes } from '@followw/core/lib/search-categories.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import { withClassrooms } from '@followw/core/queries/subjects.ts';
import { keepPreviousData, noop, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment } from 'react';
import { View } from 'react-native';

import { QueryState } from '@/components/QueryState';
import { CourseSection } from '@/components/search/CourseSection';
import { ProfessorSection } from '@/components/search/ProfessorSection';
import { TurmaSection } from '@/components/search/TurmaSection';
import { Text } from '@/components/ui/text';

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
    // na aba Todos, cursos e docentes viram prévias que levam à aba própria
    onShowCategory?: (category: 'courses' | 'professors') => void;
}) {
    const client = useQueryClient();
    const options = searchQueryOptions(text, types);
    const result = useQuery({ ...options, placeholderData: keepPreviousData });
    // a aba da categoria reaproveita a primeira página já carregada
    const showCategory =
        onShowCategory &&
        ((category: 'courses' | 'professors') => {
            const data = client.getQueryData<SearchResult>(options.queryKey)?.[category];
            if (data)
                client.setQueryData(
                    searchQueryOptions(text, searchTypes[category]).queryKey,
                    (old) =>
                        old ?? { subjects: null, courses: null, professors: null, [category]: data }
                );
            onShowCategory(category);
        });
    const refresh = () => void refreshQuery(client, options).catch(noop);
    return (
        <View className="gap-5">
            <QueryState
                query={result}
                loading="Buscando..."
                error="Não foi possível buscar."
                stale="Não foi possível atualizar a busca. Exibindo os dados salvos."
            >
                {({ courses, professors, subjects }) => {
                    const offered = withClassrooms(subjects ?? []);
                    const found =
                        courses?.items.length || professors?.items.length || offered.length;
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
                            <TurmaSection
                                title="Matérias"
                                subjects={offered}
                                currentPeriod={currentPeriod}
                                taken={taken}
                                onOpenDetails={refresh}
                            />
                        </Fragment>
                    ) : (
                        <Text className="py-8 text-center text-sm text-muted-foreground">
                            {empty}
                        </Text>
                    );
                }}
            </QueryState>
        </View>
    );
}
