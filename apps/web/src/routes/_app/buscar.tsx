import {
    keepPreviousData,
    noop,
    useQuery,
    useQueryClient,
    useSuspenseQuery
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Clock, ListFilter, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { FilterSelect } from '#/components/search/FilterSelect';
import { TurmaSection } from '#/components/search/TurmaSection';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { useOnline } from '#/lib/online';
import { loadSearchParams, useSearchState, validateSearch } from '#/lib/search-params';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';
import {
    approvedCodes,
    AVAILABILITIES,
    filterSubjects,
    isAvailability,
    isTurno,
    SEARCH_MAX_LENGTH,
    SEARCH_MIN_LENGTH,
    subjectsQuery,
    subjectsQueryOptions,
    TURNOS
} from '#/queries/subjects';

const PAGE_SIZE = 20;

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar Turmas | Followw' }] }),
    validateSearch,
    // O componente consulta após o debounce; o loader só pré-carrega ao entrar na página.
    shouldReload: ({ cause }) => cause !== 'stay',
    loader: async ({ context: { queryClient }, location }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        const { q } = loadSearchParams(location.searchStr);
        const query = subjectsQuery(q, user?.unity ?? null);
        await Promise.all([
            user && loadQuery(queryClient, allClassroomsQueryOptions).catch(noop),
            query && loadQuery(queryClient, subjectsQueryOptions(query)).catch(noop)
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
    const [{ q: busca, turno, disponibilidade }, setSearch] = useSearchState();
    const unit = user?.unity ?? null;
    // Consulta aplicada após o debounce de 300 ms; texto inválido mantém a anterior.
    const [query, setQuery] = useState(() => subjectsQuery(busca, unit));
    const [pagination, setPagination] = useState({ key: '', limit: PAGE_SIZE });
    const paginationKey = JSON.stringify([query, turno, disponibilidade]);
    const limit = pagination.key === paginationKey ? pagination.limit : PAGE_SIZE;
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
        enabled: query != null,
        placeholderData: keepPreviousData
    });
    const { data: history } = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(user) });
    const approved = useMemo(() => (history ? approvedCodes(history) : null), [history]);

    const subjects = filterSubjects(data ?? [], { turno, disponibilidade }, approved);
    const visible = subjects.slice(0, limit);
    const semester = subjects[0]?.classrooms[0]?.semester;
    const title = query?.unit ? `Matérias da ${query.unit}` : 'Resultados da busca';
    const refreshSubjects = () => {
        if (query) void refreshQuery(queryClient, subjectsQueryOptions(query)).catch(noop);
    };

    return (
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
                        void setSearch({ q: value.trim() ? value : null });
                    }}
                    maxLength={SEARCH_MAX_LENGTH}
                    placeholder="Busque por matéria, código ou professor..."
                    aria-label="Busque pelo nome, código da matéria ou professor"
                    className="h-11 bg-card pl-10 text-sm"
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FilterSelect
                    label="Turno"
                    icon={<Clock className="size-4" />}
                    value={turno}
                    options={TURNOS}
                    onChange={(value) => isTurno(value) && void setSearch({ turno: value })}
                />
                <FilterSelect
                    label="Disponibilidade"
                    icon={<ListFilter className="size-4" />}
                    value={disponibilidade}
                    options={AVAILABILITIES}
                    onChange={(value) =>
                        isAvailability(value) && void setSearch({ disponibilidade: value })
                    }
                />
            </div>
            <div aria-live="polite" aria-busy={isFetching} className="flex flex-col gap-5 pb-8">
                {!query ? (
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
                            title={semester ? `${title} · ${semester}` : title}
                            subjects={visible}
                            total={subjects.length}
                            approved={approved}
                            onOpenDetails={refreshSubjects}
                        />
                        {subjects.length > visible.length && (
                            <Button
                                variant="outline"
                                className="self-center"
                                onClick={() =>
                                    setPagination({ key: paginationKey, limit: limit + PAGE_SIZE })
                                }
                            >
                                Mostrar mais
                            </Button>
                        )}
                        {subjects.length === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                Nenhuma turma encontrada. Tente mudar a busca ou os filtros.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
