import type { InternshipItem } from '@followw/core/queries/internships.ts';
import type { SearchResult, SearchType } from '@followw/core/queries/search.ts';

import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import {
    hasSearchResults,
    searchQueryOptions,
    seedCategoryPage
} from '@followw/core/queries/search.ts';
import {
    type UseQueryResult,
    keepPreviousData,
    noop,
    useQuery,
    useQueryClient
} from '@tanstack/react-query';
import { Fragment } from 'react';
import { View } from 'react-native';

import { QueryState } from '@/components/QueryState';
import { CourseSection } from '@/components/search/CourseSection';
import {
    InternshipSection,
    InternshipSectionSkeleton
} from '@/components/search/InternshipSection';
import { ProfessorSection } from '@/components/search/ProfessorSection';
import { SubjectPageSection } from '@/components/search/SubjectPageSection';
import { Text } from '@/components/ui/text';

type PreviewCategory = 'courses' | 'professors' | 'internships';

function SearchResultSections({
    text,
    available,
    data,
    placeholder,
    empty,
    onShowCategory,
    onRefresh
}: {
    text: string;
    available: boolean;
    data: SearchResult;
    placeholder: boolean;
    // sem estágios para exibir; vale só quando não há cursos nem docentes
    empty?: string;
    onShowCategory?: (category: PreviewCategory) => void;
    onRefresh: () => void;
}) {
    const { courses, professors, subjects } = data;
    if (!hasSearchResults(data)) return null;
    const hasCoursesOrProfessors = Boolean(courses?.items.length || professors?.items.length);

    // nova busca volta os limites de cada seção ao início
    return (
        <Fragment key={text}>
            {courses && (
                <CourseSection
                    page={courses}
                    q={text}
                    onShowAll={onShowCategory && (() => onShowCategory('courses'))}
                />
            )}
            {professors && (
                <ProfessorSection
                    page={professors}
                    q={text}
                    onShowAll={onShowCategory && (() => onShowCategory('professors'))}
                />
            )}
            {subjects && (
                <SubjectPageSection
                    first={subjects}
                    query={{ q: text, offered: true, available: available || undefined }}
                    title="Turmas"
                    refreshFirst={onRefresh}
                    placeholder={placeholder}
                    empty={hasCoursesOrProfessors ? undefined : empty}
                />
            )}
        </Fragment>
    );
}

function InternshipPreview({
    query,
    text,
    onShowAll
}: {
    query: UseQueryResult<InternshipItem[], unknown>;
    text: string;
    onShowAll?: () => void;
}) {
    return (
        <QueryState
            query={query}
            loading="Carregando ofertas de estágio..."
            error="Não foi possível carregar as ofertas de estágio."
            stale="Não foi possível atualizar as vagas. Exibindo os dados salvos."
            skeleton={<InternshipSectionSkeleton title count={3} />}
        >
            {(data) => (
                <InternshipSection
                    key={text}
                    internships={data}
                    title="Estágios"
                    previewLimit={3}
                    onShowAll={onShowAll}
                />
            )}
        </QueryState>
    );
}

/** Cursos, docentes e matérias pedidos em `types` numa só consulta; `available` vale para as matérias. */
export function SearchResults({
    text,
    types,
    available,
    empty,
    onShowCategory
}: {
    text: string;
    types: SearchType[] | undefined;
    available: boolean;
    empty: string;
    // na aba Todos, cursos, docentes e estágios viram prévias que levam à aba própria
    onShowCategory?: (category: PreviewCategory) => void;
}) {
    const client = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const options = searchQueryOptions(text, types, available);
    const result = useQuery({ ...options, placeholderData: keepPreviousData });

    const showInternships = Boolean(user && onShowCategory);
    const internships = useQuery({
        ...internshipsQueryOptions,
        enabled: showInternships,
        select: (items) => filterInternships(items, text)
    });

    // a aba da categoria reaproveita a primeira página já carregada
    const showCategory =
        onShowCategory &&
        ((category: PreviewCategory) => {
            if (category !== 'internships') {
                seedCategoryPage(client, text, options.queryKey, category);
            }
            onShowCategory(category);
        });
    const refresh = () => void refreshQuery(client, options).catch(noop);
    const noInternships = !showInternships || (internships.isSuccess && !internships.data.length);
    const showEmpty =
        result.isSuccess &&
        !result.isPlaceholderData &&
        !hasSearchResults(result.data) &&
        noInternships;

    return (
        <View
            aria-busy={result.isFetching || (showInternships && internships.isFetching)}
            className="gap-5"
        >
            <QueryState
                query={result}
                loading="Buscando..."
                error="Não foi possível buscar."
                stale="Não foi possível atualizar a busca. Exibindo os dados salvos."
                className="justify-center"
            >
                {(data) => (
                    <SearchResultSections
                        text={text}
                        available={available}
                        data={data}
                        placeholder={result.isPlaceholderData}
                        empty={noInternships ? empty : undefined}
                        onShowCategory={showCategory}
                        onRefresh={refresh}
                    />
                )}
            </QueryState>
            {showInternships && (
                <InternshipPreview
                    query={internships}
                    text={text}
                    onShowAll={showCategory && (() => showCategory('internships'))}
                />
            )}
            {showEmpty && (
                <Text className="py-8 text-center text-sm text-muted-foreground">{empty}</Text>
            )}
        </View>
    );
}
