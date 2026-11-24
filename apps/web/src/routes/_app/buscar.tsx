import type { SearchCategory } from '@followw/core/lib/search-categories.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';
import type { SubjectKind, SubjectsQuery } from '@followw/core/queries/subjects.ts';

import { getCurrentSemester } from '@followw/core/calendar.ts';
import {
    SEARCH_CATEGORIES,
    searchCategoryLabels,
    searchEmptyMessages,
    searchTypes,
    showsSubjects
} from '@followw/core/lib/search-categories.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { internshipsQueryOptions } from '@followw/core/queries/internships.ts';
import { loadQuery } from '@followw/core/queries/load.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import {
    recommendationsQueryOptions,
    showRecommendations
} from '@followw/core/queries/recommendations.ts';
import { searchQueryOptions } from '@followw/core/queries/search.ts';
import {
    approvedCodes,
    currentCurriculumPeriod,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    searchText,
    subjectsQueryOptions,
    takenCodes
} from '@followw/core/queries/subjects.ts';
import { environmentManager, noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search, Briefcase } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { SchedulePreview } from '#/components/schedule/SchedulePreview';
import { usePlannedSchedule } from '#/components/schedule/usePlannedSchedule';
import { catalogQueryOptions } from '#/components/search/catalog-queries';
import { CatalogResults, type CatalogCategory } from '#/components/search/CatalogResults';
import { InternshipResults } from '#/components/search/InternshipSection';
import { RecommendationsSection } from '#/components/search/RecommendationsSection';
import { SearchResults } from '#/components/search/SearchResults';
import { SubjectFilters } from '#/components/search/SubjectFilters';
import { SubjectResults } from '#/components/search/SubjectResults';
import { TabFilter } from '#/components/TabFilter';
import { Input } from '#/components/ui/input';
import { blockStarts, loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';

type SearchView =
    | { kind: 'recommendations' }
    | { kind: 'catalog'; category: CatalogCategory }
    | { kind: 'search'; text: string }
    | { kind: 'subjects'; query: SubjectsQuery; title: string }
    | { kind: 'curriculum-login' }
    | { kind: 'internships'; text: string | null };

/** Sem texto, as abas com matérias mostram as recomendações ou a unidade do aluno, e as demais o catálogo. */
function searchView(
    category: SearchCategory,
    q: string,
    text: string | null,
    user: UserProfile | null,
    filters: Pick<
        Awaited<ReturnType<typeof loadSearchParams>>,
        'days' | 'hours' | 'start' | 'mandatory' | 'electives' | 'freeModules' | 'unit'
    >
): SearchView | null {
    const { days, start, hours, mandatory, electives, freeModules, unit } = filters;
    const subjects = showsSubjects(category);
    const kind: SubjectKind[] = [];
    if (mandatory) kind.push('mandatory');
    if (electives) kind.push('optional');
    if (freeModules) kind.push('free');
    if (subjects && kind.length && !user) return { kind: 'curriculum-login' };
    if (subjects && (kind.length || days || start.length || hours.length || unit)) {
        return {
            kind: 'subjects',
            title:
                [mandatory && 'Obrigatórias', electives && 'Optativas', freeModules && 'Livres']
                    .filter(Boolean)
                    .join(' e ') || 'Matérias',
            query: {
                q: text ?? undefined,
                unit: unit || undefined,
                offered: true,
                kind: kind.length ? kind : undefined,
                days: days || undefined,
                start: start.length ? start.flatMap(blockStarts) : undefined,
                hours: hours.length ? hours : undefined
            }
        };
    }
    const name = text && text.length >= SEARCH_MIN_LENGTH ? text : null;
    if (category === 'internships') return { kind: 'internships', text: name };
    if (subjects && showRecommendations(user, { q })) return { kind: 'recommendations' };
    if (name) return { kind: 'search', text: name };
    if (category === 'courses' || category === 'professors') return { kind: 'catalog', category };
    return subjects && user?.unit?.code
        ? {
              kind: 'subjects',
              query: { unit: user.unit.code, offered: true },
              title: `Matérias da ${user.unit.code}`
          }
        : null;
}

export const Route = createFileRoute('/_app/buscar')({
    validateSearch,
    // No navegador, inicia as consultas sem bloquear o campo; no SSR, aguarda. Depois vale o debounce.
    shouldReload: ({ cause }) => cause !== 'stay',
    loader: async ({ context: { queryClient }, location }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const { q, category, ...filters } = loadSearchParams(location.searchStr);
        const view = searchView(category, q, searchText(q), user, filters);
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
            view?.kind === 'subjects' &&
                loadQuery(queryClient, subjectsQueryOptions(view.query)).catch(noop),
            view?.kind === 'internships' &&
                user &&
                loadQuery(queryClient, internshipsQueryOptions).catch(noop)
        ]);
        if (environmentManager.isServer()) await results;
    },
    head: () => ({ meta: [{ title: 'Buscar | Followw' }] }),
    staticData: {
        header: () => (
            <HeaderBar hideOnDesktop>
                <HeaderTitle>Buscar</HeaderTitle>
            </HeaderBar>
        )
    },
    errorComponent: ErrorState,
    component: BuscarPage
});

const searchLabels: Partial<Record<SearchCategory, string>> = {
    all: 'Busque por matéria, horário, curso ou professor',
    classrooms: 'Busque por matéria, horário ou departamento',
    internships: 'Busque por estágio'
};

function BuscarPage() {
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const [{ q, category, ...filters }, setSearch] = useSearchState();
    const { items } = usePlannedSchedule();
    const planned = filters.hideConflicts ? items : undefined;
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
    const view = searchView(category, q, text, user, filters);
    const searchLabel =
        subjects && (filters.mandatory || filters.electives || filters.freeModules)
            ? 'Busque por matéria, horário ou departamento'
            : (searchLabels[category] ?? 'Busque por matéria, curso ou professor');
    const { data: history } = useQuery({
        ...allClassroomsQueryOptions,
        enabled: Boolean(user) && subjects
    });
    const completed = user?.completed_subjects;
    const approved = useMemo(
        () => (history ? approvedCodes(history, completed) : null),
        [history, completed]
    );
    const taken = useMemo(
        () => (history && approved ? takenCodes(history, approved) : null),
        [history, approved]
    );
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
                    placeholder={`${searchLabel}...`}
                    aria-label={searchLabel}
                    className="h-11 bg-card pr-12 pl-10 text-sm transition-none lg:h-14 lg:rounded-full lg:border-primary lg:bg-background lg:pl-12 lg:dark:bg-background"
                />
                {subjects && <SubjectFilters />}
            </div>
            <TabFilter
                label="Categoria da busca"
                value={category}
                options={SEARCH_CATEGORIES}
                labels={searchCategoryLabels}
                onChange={(value) => void setSearch({ category: value })}
                className="search-filters -my-2 lg:col-start-1 lg:row-start-1 lg:my-0 lg:mb-4 lg:w-fit lg:max-w-full"
            />
            <SchedulePreview />
            <div
                aria-live="polite"
                className="search-results flex min-w-0 flex-col gap-5 pb-8 lg:col-start-1 lg:row-start-2"
            >
                {!view && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Busque por matéria, departamento ou código de horário do SIGAA, como 24M34.
                        Para selecionar horários, abra o filtro de matérias.
                    </p>
                )}
                {subjects && !user && text && view?.kind !== 'curriculum-login' && (
                    <p className="text-sm text-muted-foreground">
                        <Link className="font-bold text-primary hover:underline" to="/login">
                            Entre na sua conta
                        </Link>{' '}
                        para visualizar seu fluxo.
                    </p>
                )}
                {view?.kind === 'recommendations' && (
                    <RecommendationsSection
                        currentPeriod={currentPeriod}
                        taken={taken}
                        availability={filters.hideUnavailable ? approved : undefined}
                        planned={planned}
                    />
                )}
                {view?.kind === 'search' && (
                    <SearchResults
                        key={category}
                        text={view.text}
                        types={searchTypes[category]}
                        empty={searchEmptyMessages[category]}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        availability={filters.hideUnavailable ? approved : undefined}
                        planned={planned}
                        onShowCategory={
                            category === 'all'
                                ? (value) => void setSearch({ category: value })
                                : undefined
                        }
                    />
                )}
                {view?.kind === 'catalog' && <CatalogResults category={view.category} />}
                {view?.kind === 'subjects' && (
                    <SubjectResults
                        query={view.query}
                        title={view.title}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        availability={filters.hideUnavailable ? approved : undefined}
                        planned={planned}
                    />
                )}
                {view?.kind === 'curriculum-login' && (
                    <p>
                        <Link className="font-bold text-primary" to="/login">
                            Entre na sua conta
                        </Link>{' '}
                        para filtrar as matérias pela matriz do seu curso.
                    </p>
                )}
                {view?.kind === 'internships' &&
                    (user ? (
                        <InternshipResults text={view.text} />
                    ) : (
                        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center text-card-foreground">
                            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Briefcase className="size-6" aria-hidden="true" />
                            </div>
                            <div className="flex max-w-sm flex-col gap-1">
                                <h3 className="text-base font-semibold">
                                    Ofertas de Estágio do SIGAA
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Entre na sua conta para consultar as vagas de estágio abertas
                                    para o seu curso e para a UnB.
                                </p>
                            </div>
                            <Link
                                to="/login"
                                className="mt-2 inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90"
                            >
                                Entrar na sua conta
                            </Link>
                        </div>
                    ))}
            </div>
        </div>
    );
}
