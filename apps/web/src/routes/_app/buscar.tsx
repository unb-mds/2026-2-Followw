import { keepPreviousData, noop, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Clock, ListFilter, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { Availability, Turno } from '#/queries/subjects';

import { ErrorCard, ErrorState } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { FilterSelect } from '#/components/search/FilterSelect';
import { TurmaSection } from '#/components/search/TurmaSection';
import { Input } from '#/components/ui/input';
import { useOnline } from '#/lib/online';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import {
    approvedCodes,
    AVAILABILITIES,
    filterSubjects,
    isAvailability,
    isTurno,
    subjectsQuery,
    subjectsQueryOptions,
    TURNOS
} from '#/queries/subjects';

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar Turmas | Followw' }] }),
    loader: async ({ context: { queryClient } }) => {
        const user = await loadQuery(queryClient, meQueryOptions);
        if (!user) return;
        const query = subjectsQuery('', user.unity);
        await Promise.all([
            loadQuery(queryClient, allClassroomsQueryOptions).catch(noop),
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
    const { data: user } = useSuspenseQuery(meQueryOptions);
    const [busca, setBusca] = useState('');
    const [debounced, setDebounced] = useState('');
    const [turno, setTurno] = useState<Turno>('Todos');
    const [disponibilidade, setDisponibilidade] = useState<Availability>('Todas');
    const online = useOnline();

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(busca), 300);
        return () => clearTimeout(timer);
    }, [busca]);

    const unit = user?.unity ?? null;
    const query = subjectsQuery(debounced, unit);
    const { data, isPending, isFetching, isLoadingError, isError, refetch } = useQuery({
        ...subjectsQueryOptions(query ?? {}),
        enabled: query != null,
        placeholderData: keepPreviousData
    });
    const { data: history } = useQuery({ ...allClassroomsQueryOptions, enabled: Boolean(user) });
    const approved = useMemo(() => (history ? approvedCodes(history) : null), [history]);

    const subjects = filterSubjects(data ?? [], { turno, disponibilidade }, approved);
    const semester = subjects[0]?.classrooms[0]?.semester;
    const title = query?.unit ? `Matérias da ${query.unit}` : 'Resultados da busca';

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
                    onChange={(e) => setBusca(e.target.value)}
                    maxLength={200}
                    placeholder="Busque pelo nome ou código da matéria..."
                    aria-label="Busque pelo nome ou código da matéria"
                    className="h-11 bg-card pl-10 text-sm"
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FilterSelect
                    label="Turno"
                    icon={<Clock className="size-4" />}
                    value={turno}
                    options={TURNOS}
                    onChange={(value) => isTurno(value) && setTurno(value)}
                />
                <FilterSelect
                    label="Disponibilidade"
                    icon={<ListFilter className="size-4" />}
                    value={disponibilidade}
                    options={AVAILABILITIES}
                    onChange={(value) => isAvailability(value) && setDisponibilidade(value)}
                />
            </div>
            <div aria-live="polite" aria-busy={isFetching} className="flex flex-col gap-5 pb-8">
                {!query ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Digite o nome ou o código de uma matéria para ver as turmas.
                    </p>
                ) : isPending ? (
                    <LoadingText>Buscando turmas...</LoadingText>
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
                            <p className="text-xs text-muted-foreground">
                                Entre na sua conta para verificar os pré-requisitos das matérias.
                            </p>
                        )}
                        <TurmaSection
                            title={semester ? `${title} · ${semester}` : title}
                            subjects={subjects}
                            approved={approved}
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
    );
}
