import {
    keepPreviousData,
    noop,
    useQuery,
    useQueryClient,
    useSuspenseQuery
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { getCurrentSemester } from '#/calendar';
import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { RecommendationsSection } from '#/components/search/RecommendationsSection';
import { SchedulePlanner, SchedulePreview } from '#/components/search/SchedulePlanner';
import { TurmaSection } from '#/components/search/TurmaSection';
import { TabFilter } from '#/components/TabFilter';
import { Input } from '#/components/ui/input';
import { useOnline } from '#/lib/online';
import { loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { recommendationsQueryOptions, showRecommendations } from '#/queries/recommendations';
import { refreshQuery } from '#/queries/refresh';
import {
    approvedCodes,
    takenCodes,
    currentCurriculumPeriod,
    filterSubjects,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    subjectsQuery,
    subjectsQueryOptions,
    TIPOS
} from '#/queries/subjects';

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar Turmas | Followw' }] }),
    validateSearch,
    // O componente consulta após o debounce; o loader só pré-carrega ao entrar na página.
    shouldReload: ({ cause }) => cause !== 'stay',
    loader: async ({ context: { queryClient }, location }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const search = loadSearchParams(location.searchStr);
        const recommendations = showRecommendations(user, { q: search.busca, tipo: search.tipo });
        const query = recommendations
            ? null
            : subjectsQuery(search.busca, user?.unit?.code ?? null);
        await Promise.all([
            user && loadQuery(queryClient, allClassroomsQueryOptions).catch(noop),
            query && loadQuery(queryClient, subjectsQueryOptions(query)).catch(noop),
            recommendations && loadQuery(queryClient, recommendationsQueryOptions).catch(noop)
        ]);
    },
    staticData: {
        header: () => (
            <HeaderBar>
                <HeaderTitle>Buscar Turmas</HeaderTitle>
            </HeaderBar>
        )
    },
    errorComponent: ErrorState,
    component: BuscarTurmasPage
});

function BuscarTurmasPage() {
    const queryClient = useQueryClient();
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const [{ busca, tipo }, setSearch] = useSearchState();
    const recommendations = showRecommendations(user, { q: busca, tipo });
    const unit = user?.unit?.code ?? null;
    const currentPeriod = currentCurriculumPeriod(
        user?.entry_semester,
        getCurrentSemester()?.semester
    );
    // Consulta aplicada após o debounce de 300 ms; texto inválido mantém a anterior.
    const [query, setQuery] = useState(() => subjectsQuery(busca, unit));
    const online = useOnline();

    useEffect(() => {
        const timer = setTimeout(
            () => setQuery((previous) => subjectsQuery(busca, unit, previous)),
            300
        );
        return () => clearTimeout(timer);
    }, [busca, unit]);

    const { data, isPending, isFetching, isLoadingError, isError, refetch } = useQuery({
        ...subjectsQueryOptions(query ?? {}),
        enabled: !recommendations && query != null,
        placeholderData: keepPreviousData
    });
    const { data: history } = useQuery({
        ...allClassroomsQueryOptions,
        enabled: Boolean(user)
    });
    const approved = useMemo(() => (history ? approvedCodes(history) : null), [history]);
    const taken = useMemo(() => (history ? takenCodes(history) : null), [history]);

    const subjects = filterSubjects(data ?? []);
    const semester = subjects[0]?.classrooms[0]?.semester;
    const title = query?.unit ? `Matérias da ${query.unit}` : 'Resultados da busca';
    const refreshSubjects = () => {
        if (query) void refreshQuery(queryClient, subjectsQueryOptions(query)).catch(noop);
    };

    return (
        <SchedulePlanner maxHours={user?.period_max_workload}>
            <div className="flex flex-col gap-5">
                <div className="relative">
                    <Search
                        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        type="search"
                        value={busca}
                        onChange={(e) => {
                            const value = e.target.value.slice(0, SEARCH_MAX_LENGTH);
                            void setSearch({ busca: value.trim() ? value : null });
                        }}
                        maxLength={SEARCH_MAX_LENGTH}
                        placeholder="Busque por matéria, código ou professor..."
                        aria-label="Busque pelo nome, código da matéria ou professor"
                        className="h-11 bg-card pl-10 text-sm"
                    />
                </div>
                {user?.level === 'Graduação' && (
                    <TabFilter
                        label="Tipo de matéria"
                        value={tipo}
                        options={TIPOS}
                        onChange={(value) => void setSearch({ tipo: value })}
                        className="-my-2"
                    />
                )}
                <SchedulePreview />
                <div aria-live="polite" aria-busy={isFetching} className="flex flex-col gap-5 pb-8">
                    {recommendations ? (
                        <RecommendationsSection
                            filters={{ tipo, busca }}
                            currentPeriod={currentPeriod}
                            approved={approved}
                            taken={taken}
                        />
                    ) : !query ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                            {`Digite de ${SEARCH_MIN_LENGTH} a ${SEARCH_MAX_LENGTH} caracteres do nome, código da matéria ou professor para ver as turmas.`}
                        </p>
                    ) : isPending ? (
                        <LoadingText className="justify-center">Buscando turmas...</LoadingText>
                    ) : isLoadingError ? (
                        <ErrorCard
                            message="Não foi possível buscar as turmas."
                            onRetry={() => refetch()}
                        />
                    ) : (
                        <>
                            {isError && online && (
                                <ErrorCard
                                    message="Não foi possível atualizar as turmas. Exibindo os dados salvos."
                                    onRetry={() => refetch()}
                                />
                            )}
                            {!user && (
                                <p className="text-sm text-muted-foreground">
                                    <Link
                                        className="font-bold text-primary hover:underline"
                                        to="/login"
                                    >
                                        Entre na sua conta
                                    </Link>{' '}
                                    para visualizar seu fluxo.
                                </p>
                            )}
                            <TurmaSection
                                key={JSON.stringify(query)}
                                title={semester ? `${title} · ${semester}` : title}
                                subjects={subjects}
                                currentPeriod={currentPeriod}
                                approved={approved}
                                taken={taken}
                                onOpenDetails={refreshSubjects}
                            />
                            {subjects.length === 0 && (
                                <p className="py-8 text-center text-sm text-muted-foreground">
                                    Nenhuma turma encontrada. Tente mudar a busca ou os filtros.
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </SchedulePlanner>
    );
}
