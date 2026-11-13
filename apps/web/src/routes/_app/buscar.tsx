import type { SearchCategory } from '@followw/core/lib/search-categories.ts';

import { getCurrentSemester } from '@followw/core/calendar.ts';
import {
    SEARCH_CATEGORIES,
    searchCategoryLabels,
    searchEmptyMessages,
    searchTypes,
    showsSubjects
} from '@followw/core/lib/search-categories.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import {
    recommendationsQueryOptions,
    showRecommendations
} from '@followw/core/queries/recommendations.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import {
    takenCodes,
    currentCurriculumPeriod,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    searchText,
    subjectsQueryOptions
} from '@followw/core/queries/subjects.ts';
import { environmentManager, noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { UserProfile } from '#/queries/me';

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
import { loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';
import { meQueryOptions } from '#/queries/me';

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
    // O componente consulta após o debounce; o loader só pré-carrega ao entrar na página.
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
                <HeaderTitle>Buscar</HeaderTitle>
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
        <div className="flex flex-col gap-5">
            <div className="relative">
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
                    className="h-11 bg-card pl-10 text-sm"
                />
            </div>
            <TabFilter
                label="Categoria da busca"
                value={category}
                options={SEARCH_CATEGORIES}
                labels={searchCategoryLabels}
                onChange={(value) => void setSearch({ category: value })}
                className="-my-2"
            />
            <SchedulePreview />
            <div aria-live="polite" className="flex flex-col gap-5 pb-8">
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
