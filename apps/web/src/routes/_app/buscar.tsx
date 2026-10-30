import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { getCurrentSemester } from '#/calendar';
import { ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { SchedulePreview } from '#/components/schedule/SchedulePreview';
import { CourseSection } from '#/components/search/CourseSection';
import { ProfessorResults } from '#/components/search/ProfessorResults';
import { RecommendationsSection } from '#/components/search/RecommendationsSection';
import { SubjectResults } from '#/components/search/SubjectResults';
import { TabFilter } from '#/components/TabFilter';
import { Input } from '#/components/ui/input';
import { SEARCH_CATEGORIES, searchCategoryLabels, searchSections } from '#/lib/search-categories';
import { loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { coursesQueryOptions } from '#/queries/courses';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { professorSearch, professorsQueryOptions } from '#/queries/professors';
import { recommendationsQueryOptions, showRecommendations } from '#/queries/recommendations';
import {
    takenCodes,
    currentCurriculumPeriod,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    subjectsQuery,
    subjectsQueryOptions
} from '#/queries/subjects';

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar | Followw' }] }),
    validateSearch,
    // O componente consulta após o debounce; o loader só pré-carrega ao entrar na página.
    shouldReload: ({ cause }) => cause !== 'stay',
    loader: async ({ context: { queryClient }, location }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const search = loadSearchParams(location.searchStr);
        const sections = searchSections(search.category);
        const recommendations = sections.classrooms && showRecommendations(user, search);
        const query = recommendations ? null : subjectsQuery(search.q, user?.unit?.code ?? null);
        const text = subjectsQuery(search.q, null)?.q;
        const professorName = professorSearch(text);
        await Promise.all([
            sections.classrooms &&
                user &&
                loadQuery(queryClient, allClassroomsQueryOptions).catch(noop),
            sections.classrooms &&
                query &&
                loadQuery(queryClient, subjectsQueryOptions(query)).catch(noop),
            sections.courses && text && loadQuery(queryClient, coursesQueryOptions).catch(noop),
            sections.professors &&
                professorName &&
                loadQuery(queryClient, professorsQueryOptions(professorName)).catch(noop),
            recommendations && loadQuery(queryClient, recommendationsQueryOptions).catch(noop)
        ]);
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
    const sections = searchSections(category);
    const recommendations = sections.classrooms && showRecommendations(user, { q });
    const unit = user?.unit?.code ?? null;
    const currentPeriod = currentCurriculumPeriod(
        user?.entry_semester,
        getCurrentSemester()?.semester
    );
    // Consulta aplicada após o debounce de 300 ms; texto inválido mantém a anterior.
    const [query, setQuery] = useState(() => subjectsQuery(q, unit));
    useEffect(() => {
        const timer = setTimeout(
            () => setQuery((previous) => subjectsQuery(q, unit, previous)),
            300
        );
        return () => clearTimeout(timer);
    }, [q, unit]);
    const { data: history } = useQuery({
        ...allClassroomsQueryOptions,
        enabled: sections.classrooms && Boolean(user)
    });
    const taken = useMemo(() => (history ? takenCodes(history) : null), [history]);
    const text = query?.q ?? '';
    const canSearch = recommendations || (sections.classrooms && query != null) || Boolean(text);
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
                    placeholder="Busque por matérias, código, curso ou professor..."
                    aria-label="Busque por matérias, código, curso ou professor"
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
                {!canSearch && (
                    <p className="py-8 text-center text-sm text-muted-foreground">{`Digite de ${SEARCH_MIN_LENGTH} a ${SEARCH_MAX_LENGTH} caracteres do nome, código da matéria, curso ou professor para ver os resultados.`}</p>
                )}
                {sections.courses && text && (
                    <CourseSection key={text} text={text} showEmpty={category === 'courses'} />
                )}
                {sections.classrooms && !user && query && (
                    <p className="text-sm text-muted-foreground">
                        <Link className="font-bold text-primary hover:underline" to="/login">
                            Entre na sua conta
                        </Link>{' '}
                        para visualizar seu fluxo.
                    </p>
                )}
                {sections.professors && text && (
                    <ProfessorResults text={text} showEmpty={category === 'professors'} />
                )}
                {sections.classrooms &&
                    (recommendations ? (
                        <RecommendationsSection currentPeriod={currentPeriod} taken={taken} />
                    ) : (
                        query && (
                            <SubjectResults
                                query={query}
                                currentPeriod={currentPeriod}
                                taken={taken}
                            />
                        )
                    ))}
            </div>
        </div>
    );
}
