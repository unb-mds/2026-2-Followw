import { environmentManager, noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { SearchCategory } from '#/lib/search-categories';
import type { UserProfile } from '#/queries/me';

import { getCurrentSemester } from '#/calendar';
import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { SchedulePreview } from '#/components/schedule/SchedulePreview';
import {
    CatalogResults,
    type CatalogCategory,
    catalogQueryOptions
} from '#/components/search/CatalogResults';
import { RecommendationsSection } from '#/components/search/RecommendationsSection';
import { SearchResults } from '#/components/search/SearchResults';
import { SubjectResults } from '#/components/search/SubjectResults';
import { TabFilter } from '#/components/TabFilter';
import { Input } from '#/components/ui/input';
import {
    SEARCH_CATEGORIES,
    searchCategoryLabels,
    searchEmptyMessages,
    searchTypes,
    showsSubjects
} from '#/lib/search-categories';
import { loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { recommendationsQueryOptions, showRecommendations } from '#/queries/recommendations';
import { searchQueryOptions } from '#/queries/search';
import {
    takenCodes,
    currentCurriculumPeriod,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    searchText,
    subjectsQueryOptions
} from '#/queries/subjects';

type SearchView =
    | { kind: 'recommendations' }
    | { kind: 'catalog'; category: CatalogCategory }
    | { kind: 'search'; text: string }
    | { kind: 'unit'; unit: string };

/** Sem texto, as abas com matérias mostram as recomendações ou a unidade do aluno, e as demais o catálogo. */
function searchView(
    category: SearchCategory,
    q: string,
    text: string | null,
    user: UserProfile | null
): SearchView | null {
    const subjects = showsSubjects(category);
    if (subjects && showRecommendations(user, { q })) return { kind: 'recommendations' };
    if (text) return { kind: 'search', text };
    if (category === 'courses' || category === 'professors') return { kind: 'catalog', category };
    const unit = user?.unit?.code;
    return subjects && unit ? { kind: 'unit', unit } : null;
}

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar | Followw' }] }),
    validateSearch,
    // No navegador, inicia as consultas sem bloquear o campo; no SSR, aguarda. Depois vale o debounce.
    shouldReload: ({ cause }) => cause !== 'stay',
    loader: async ({ context: { queryClient }, location }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const { q, category } = loadSearchParams(location.searchStr);
        const view = searchView(category, q, searchText(q), user);
        const results = Promise.all([
            showsSubjects(category) &&
                user &&
                loadQuery(queryClient, allClassroomsQueryOptions).catch(noop),
            view?.kind === 'recommendations' &&
                loadQuery(queryClient, recommendationsQueryOptions).catch(noop),
            view?.kind === 'search' &&
                loadQuery(queryClient, searchQueryOptions(view.text, searchTypes[category])).catch(
                    noop
                ),
            view?.kind === 'catalog' &&
                (view.category === 'courses'
                    ? loadQuery(queryClient, catalogQueryOptions.courses)
                    : loadQuery(queryClient, catalogQueryOptions.professors)
                ).catch(noop),
            view?.kind === 'unit' &&
                loadQuery(queryClient, subjectsQueryOptions({ unit: view.unit })).catch(noop)
        ]);
        if (environmentManager.isServer()) await results;
    },
    staticData: {
        header: () => (
            <HeaderBar>
                <div className="flex flex-col gap-3">
                    <HeaderTitle>Buscar</HeaderTitle>
                    <p className="hidden text-sm text-muted-foreground lg:block">
                        Encontre turmas e organize seus horários.
                    </p>
                </div>
            </HeaderBar>
        )
    },
    errorComponent: ErrorState,
    component: BuscarPage
});

function BuscarPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const [{ q, category }, setSearch] = useSearchState();
    const subjects = showsSubjects(category);
    const currentPeriod = currentCurriculumPeriod(
        user?.entry_semester,
        getCurrentSemester()?.semester
    );
    // Texto aplicado após o debounce de 300 ms; inválido mantém o anterior.
    const [text, setText] = useState(() => searchText(q));
    useEffect(() => {
        const timer = setTimeout(() => setText((previous) => searchText(q, previous)), 300);
        return () => clearTimeout(timer);
    }, [q]);
    const view = searchView(category, q, text, user);
    const { data: history } = useQuery({
        ...allClassroomsQueryOptions,
        enabled: subjects && Boolean(user)
    });
    const taken = useMemo(() => (history ? takenCodes(history) : null), [history]);
    return (
        <div className="search-columns flex flex-col gap-5 lg:grid lg:items-start lg:gap-x-10">
            <div className="desktop-search-field relative lg:fixed">
                <Search
                    className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                />
                <Input
                    type="search"
                    value={q}
                    onChange={(event) => {
                        const value = event.target.value.slice(0, SEARCH_MAX_LENGTH);
                        void setSearch({ q: value.trim() ? value : null });
                    }}
                    maxLength={SEARCH_MAX_LENGTH}
                    placeholder="Busque por matéria, curso ou professor..."
                    aria-label="Busque por matéria, curso ou professor"
                    className="h-11 bg-card pl-10 text-sm lg:h-14 lg:rounded-full lg:border-primary lg:bg-background lg:pl-12"
                />
            </div>
            <TabFilter
                label="Categoria da busca"
                value={category}
                options={SEARCH_CATEGORIES}
                labels={searchCategoryLabels}
                onChange={(value) => void setSearch({ category: value })}
                className="search-filters -my-2 lg:col-start-1 lg:row-start-1 lg:my-0 lg:mb-4 lg:w-fit"
            />
            <SchedulePreview />
            <div
                aria-live="polite"
                className="search-results flex min-w-0 flex-col gap-5 pb-8 lg:col-start-1 lg:row-start-2"
            >
                {!view && (
                    <p className="py-8 text-center text-sm text-muted-foreground">{`Digite de ${SEARCH_MIN_LENGTH} a ${SEARCH_MAX_LENGTH} caracteres do nome, código da matéria, curso ou professor para ver os resultados.`}</p>
                )}
                {subjects && !user && text && (
                    <p className="text-sm text-muted-foreground">
                        <Link className="font-bold text-primary hover:underline" to="/login">
                            Entre na sua conta
                        </Link>{' '}
                        para visualizar seu fluxo.
                    </p>
                )}
                {view?.kind === 'recommendations' && (
                    <RecommendationsSection currentPeriod={currentPeriod} taken={taken} />
                )}
                {view?.kind === 'search' && (
                    <SearchResults
                        key={category}
                        text={view.text}
                        types={searchTypes[category]}
                        empty={searchEmptyMessages[category]}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        onShowCategory={
                            category === 'all'
                                ? (value) => void setSearch({ category: value })
                                : undefined
                        }
                    />
                )}
                {view?.kind === 'catalog' && <CatalogResults category={view.category} />}
                {view?.kind === 'unit' && (
                    <SubjectResults unit={view.unit} currentPeriod={currentPeriod} taken={taken} />
                )}
            </div>
        </div>
    );
}
