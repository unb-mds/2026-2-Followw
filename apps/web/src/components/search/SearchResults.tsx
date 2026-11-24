import type { InternshipItem } from '@followw/core/queries/internships.ts';
import type { SearchResult, SearchType } from '@followw/core/queries/search.ts';

import { searchTypes } from '@followw/core/lib/search-categories.ts';
import { filterInternships, internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import { withClassrooms } from '@followw/core/queries/subjects.ts';
import {
    type UseQueryResult,
    keepPreviousData,
    noop,
    useQuery,
    useQueryClient
} from '@tanstack/react-query';
import { Fragment } from 'react';

import { QueryState } from '#/components/QueryState';
import { CourseSection } from '#/components/search/CourseSection';
import {
    InternshipSection,
    InternshipSectionSkeleton
} from '#/components/search/InternshipSection';
import { ProfessorSection } from '#/components/search/ProfessorSection';
import { TurmaSection } from '#/components/search/TurmaSection';
import { refreshQuery } from '#/queries/refresh';

type PreviewCategory = 'courses' | 'professors' | 'internships';

function seedCategoryPage(
    client: ReturnType<typeof useQueryClient>,
    text: string,
    queryKey: readonly unknown[],
    category: 'courses' | 'professors'
) {
    const data = client.getQueryData<SearchResult>(queryKey)?.[category];
    if (!data) return;
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

function SearchResultSections({
    text,
    data,
    currentPeriod,
    taken,
    onShowCategory,
    onOpenDetails
}: {
    text: string;
    data: SearchResult;
    currentPeriod: number | null;
    taken: Set<string> | null;
    onShowCategory?: (category: PreviewCategory) => void;
    onOpenDetails: () => void;
}) {
    const { courses, professors, subjects } = data;
    const offered = withClassrooms(subjects ?? []);
    if (!courses?.items.length && !professors?.items.length && !offered.length) return null;

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
            <TurmaSection
                title="Turmas"
                subjects={offered}
                currentPeriod={currentPeriod}
                taken={taken}
                onOpenDetails={onOpenDetails}
            />
        </Fragment>
    );
}

function hasSearchResults(data: SearchResult | undefined) {
    if (!data) return false;
    return Boolean(
        data.courses?.items.length ||
        data.professors?.items.length ||
        withClassrooms(data.subjects ?? []).length
    );
}

function isSearchEmpty(
    result: { isSuccess: boolean; isPlaceholderData: boolean; data?: SearchResult },
    showInternships: boolean,
    internships: { isSuccess: boolean; data?: unknown[] }
) {
    if (!result.isSuccess || result.isPlaceholderData || hasSearchResults(result.data)) {
        return false;
    }
    return !showInternships || (internships.isSuccess && !internships.data?.length);
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
    onShowCategory?: (category: PreviewCategory) => void;
}) {
    const client = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const options = searchQueryOptions(text, types);
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
    const busy = result.isFetching || (showInternships && internships.isFetching);
    const showEmpty = isSearchEmpty(result, showInternships, internships);

    return (
        <div aria-busy={busy} className="flex flex-col gap-5">
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
                        data={data}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        onShowCategory={showCategory}
                        onOpenDetails={refresh}
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
            {showEmpty && <p className="py-8 text-center text-sm text-muted-foreground">{empty}</p>}
        </div>
    );
}
