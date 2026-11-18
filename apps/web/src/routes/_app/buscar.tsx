import type { SearchCategory } from '@followw/core/lib/search-categories.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';
import type { SubjectsQuery } from '@followw/core/queries/subjects.ts';

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
    isScheduleSearch,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    searchText,
    subjectsQueryOptions,
    takenCodes
} from '@followw/core/queries/subjects.ts';
import { environmentManager, noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search, Briefcase } from 'lucide-react';
import { m, type Variants } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { useDesktop } from '#/components/DesktopContext';
import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { SchedulePreview } from '#/components/schedule/SchedulePreview';
import { usePlannedSchedule } from '#/components/schedule/usePlannedSchedule';
import {
    CatalogResults,
    type CatalogCategory,
    catalogQueryOptions
} from '#/components/search/CatalogResults';
import { InternshipResults } from '#/components/search/InternshipSection';
import { RecommendationsSection } from '#/components/search/RecommendationsSection';
import { SearchResults } from '#/components/search/SearchResults';
import { SubjectFilters } from '#/components/search/SubjectFilters';
import { SubjectResults } from '#/components/search/SubjectResults';
import { SearchPill } from '#/components/SearchPill';
import { TabFilter } from '#/components/TabFilter';
import { Input } from '#/components/ui/input';
import { ease, useEntrance } from '#/lib/motion';
import { loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';

type SearchView =
    | { kind: 'recommendations' }
    | { kind: 'catalog'; category: CatalogCategory }
    | { kind: 'search'; text: string }
    | { kind: 'schedule'; text: string }
    | { kind: 'unit'; unit: string }
    | { kind: 'filtered'; query: SubjectsQuery }
    | { kind: 'elective-login' }
    | { kind: 'internships'; text: string | null };

/** Sem texto, as abas com matérias mostram as recomendações ou a unidade do aluno, e as demais o catálogo. */
function searchView(
    category: SearchCategory,
    q: string,
    text: string | null,
    user: UserProfile | null,
    filters: Pick<
        Awaited<ReturnType<typeof loadSearchParams>>,
        'unit' | 'days' | 'hours' | 'start' | 'electives' | 'freeModules'
    >
): SearchView | null {
    const schedule = text !== null && isScheduleSearch(text);
    const { days, start, unit, hours, electives, freeModules } = filters;
    const subjects = showsSubjects(category);
    if (subjects && (electives || freeModules) && !user) return { kind: 'elective-login' };
    if (subjects && (electives || freeModules || days || start || unit || hours)) {
        return {
            kind: 'filtered',
            query: {
                q: schedule ? undefined : (text ?? undefined),
                timetable: schedule ? text : undefined,
                electives: electives || undefined,
                free_modules: freeModules || undefined,
                days: days || undefined,
                start: start || undefined,
                unit: unit || undefined,
                hours: hours ?? undefined
            }
        };
    }
    const name = text && text.length >= SEARCH_MIN_LENGTH ? text : null;
    if (category === 'internships') return { kind: 'internships', text: name };
    if (subjects && showRecommendations(user, { q })) return { kind: 'recommendations' };
    if (subjects && text && schedule) return { kind: 'schedule', text };
    if (name) return { kind: 'search', text: name };
    if (category === 'courses' || category === 'professors') return { kind: 'catalog', category };
    return subjects && user?.unit?.code ? { kind: 'unit', unit: user.unit.code } : null;
}

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar | Followw' }] }),
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
            view?.kind === 'schedule' &&
                view.text &&
                loadQuery(queryClient, searchQueryOptions(view.text, searchTypes.classrooms)).catch(
                    noop
                ),
            view?.kind === 'catalog' &&
                (view.category === 'courses'
                    ? loadQuery(queryClient, catalogQueryOptions.courses)
                    : loadQuery(queryClient, catalogQueryOptions.professors)
                ).catch(noop),
            view?.kind === 'unit' &&
                loadQuery(queryClient, subjectsQueryOptions({ unit: view.unit })).catch(noop),
            view?.kind === 'filtered' &&
                loadQuery(queryClient, subjectsQueryOptions(view.query)).catch(noop),
            view?.kind === 'internships' &&
                user &&
                loadQuery(queryClient, internshipsQueryOptions).catch(noop)
        ]);
        if (environmentManager.isServer()) await results;
    },
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

// o conteúdo do campo aparece depois que a pílula termina de expandir
const fieldContent: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.2, ease, delay: 0.2 } }
};

const searchLabels: Partial<Record<SearchCategory, string>> = {
    all: 'Busque por matéria, horário, curso ou professor',
    classrooms: 'Busque por matéria ou horário',
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
    const subjectTitle = [filters.electives && 'Optativas', filters.freeModules && 'Módulos livres']
        .filter(Boolean)
        .join(' e ');
    const searchLabel =
        subjects && subjectTitle
            ? 'Busque por matéria ou horário'
            : (searchLabels[category] ?? 'Busque por matéria, curso ou professor');
    const { data: history } = useQuery({
        ...allClassroomsQueryOptions,
        enabled: Boolean(user) && subjects
    });
    const completed = user?.completed_subjects;
    const taken = useMemo(
        () => (history ? takenCodes(history, approvedCodes(history, completed)) : null),
        [history, completed]
    );
    const desktop = useDesktop();
    const entrance = useEntrance();
    return (
        <div className="search-columns flex flex-col gap-5 lg:grid lg:items-start lg:gap-x-10">
            <m.div layoutRoot className="desktop-search-field relative lg:fixed">
                <SearchPill className="hidden border border-primary bg-background lg:block" />
                <m.div
                    className="relative"
                    initial={desktop ? entrance.initial : false}
                    animate="show"
                    variants={fieldContent}
                >
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
                        className="h-11 bg-card pr-12 pl-10 text-sm lg:h-14 lg:rounded-full lg:border-transparent lg:bg-transparent lg:pl-12 lg:dark:bg-transparent"
                    />
                    {subjects && <SubjectFilters />}
                </m.div>
            </m.div>
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
                        Para buscar pelo início da aula, digite 10h ou segunda e quarta 10h. Você
                        também pode usar um código do SIGAA, como 24M34.
                    </p>
                )}
                {subjects && !user && text && view?.kind !== 'elective-login' && (
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
                        planned={planned}
                        onShowCategory={
                            category === 'all'
                                ? (value) => void setSearch({ category: value })
                                : undefined
                        }
                    />
                )}
                {view?.kind === 'schedule' && (
                    <SearchResults
                        key={view.text}
                        text={view.text}
                        types={searchTypes.classrooms}
                        empty="Nenhuma turma corresponde ao horário pesquisado."
                        currentPeriod={currentPeriod}
                        taken={taken}
                        planned={planned}
                    />
                )}
                {view?.kind === 'catalog' && <CatalogResults category={view.category} />}
                {view?.kind === 'unit' && (
                    <SubjectResults
                        query={{ unit: view.unit }}
                        title={`Matérias da ${view.unit}`}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        planned={planned}
                    />
                )}
                {view?.kind === 'filtered' && (
                    <SubjectResults
                        query={view.query}
                        title={subjectTitle || 'Matérias'}
                        currentPeriod={currentPeriod}
                        taken={taken}
                        planned={planned}
                    />
                )}
                {view?.kind === 'elective-login' && (
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
