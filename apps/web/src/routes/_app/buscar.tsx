import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { Clock, ListFilter, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { SearchTurmasFilters } from '#/queries/search-classrooms';

import { ErrorCard } from '#/components/ErrorState';
import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { LoadingText } from '#/components/LoadingText';
import { FilterSelect } from '#/components/search/FilterSelect';
import { TurmaSection } from '#/components/search/TurmaSection';
import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { useOnline } from '#/lib/online';
import { loadQuery } from '#/queries/load';
import { meQueryOptions } from '#/queries/me';
import {
    AVAILABILITIES,
    isAvailability,
    isTurno,
    PAGE_SIZE,
    searchClassroomsQueryOptions,
    TURNOS
} from '#/queries/search-classrooms';

const CATALOG_ERROR = 'Não foi possível carregar o catálogo de turmas.';

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar Turmas | Followw' }] }),
    loader: ({ context: { queryClient } }) =>
        loadQuery(queryClient, searchClassroomsQueryOptions()),
    staticData: {
        header: () => (
            <HeaderBar>
                <HeaderTitle>Buscar Turmas</HeaderTitle>
            </HeaderBar>
        )
    },
    errorComponent: CatalogError,
    component: BuscarTurmasPage
});

function CatalogError() {
    const router = useRouter();
    return <ErrorCard message={CATALOG_ERROR} onRetry={() => router.invalidate()} />;
}

function BuscarTurmasPage() {
    const { data: initialCatalog } = useSuspenseQuery(searchClassroomsQueryOptions());
    const { data: user } = useQuery(meQueryOptions);
    const [busca, setBusca] = useState('');
    const [filters, setFilters] = useState<SearchTurmasFilters>({});
    const offset = filters.offset ?? 0;
    const online = useOnline();
    const { data, isPending, isLoadingError, isError, refetch } = useQuery(
        searchClassroomsQueryOptions(filters, user?.registration ?? null)
    );

    useEffect(() => {
        const timer = setTimeout(
            () => setFilters((current) => ({ ...current, busca, offset: 0 })),
            300
        );
        return () => clearTimeout(timer);
    }, [busca]);

    const turmas = data?.classrooms ?? [];

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
                    placeholder="Busque por matéria, código, local ou docente..."
                    aria-label="Busque por matéria, código, local ou docente"
                    className="h-11 bg-card pl-10 text-sm"
                />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <FilterSelect
                    label="Turno"
                    icon={<Clock className="size-4" />}
                    value={filters.turno ?? 'Todos'}
                    options={TURNOS}
                    onChange={(turno) => {
                        if (isTurno(turno))
                            setFilters((current) => ({ ...current, turno, offset: 0 }));
                    }}
                />
                <FilterSelect
                    label="Disponibilidade"
                    icon={<ListFilter className="size-4" />}
                    value={filters.disponibilidade ?? 'Todas'}
                    options={AVAILABILITIES}
                    onChange={(disponibilidade) => {
                        if (isAvailability(disponibilidade))
                            setFilters((current) => ({ ...current, disponibilidade, offset: 0 }));
                    }}
                />
            </div>
            <div aria-live="polite" aria-busy={isPending} className="flex flex-col gap-5">
                {isPending ? (
                    <LoadingText>Buscando turmas...</LoadingText>
                ) : isLoadingError ? (
                    <ErrorCard message={CATALOG_ERROR} onRetry={() => refetch()} />
                ) : (
                    <>
                        {isError && online && (
                            <ErrorCard
                                message="Não foi possível atualizar o catálogo. Exibindo os dados salvos."
                                onRetry={() => refetch()}
                            />
                        )}
                        {!user && (
                            <p className="text-xs text-muted-foreground">
                                Entre na sua conta para verificar os pré-requisitos das matérias.
                            </p>
                        )}
                        <TurmaSection
                            title={`Turmas do semestre ${data?.semester ?? ''}`}
                            turmas={turmas}
                        />
                        {data?.total === 0 && (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                {initialCatalog.semesters.length === 0
                                    ? 'Nenhuma turma disponível no catálogo.'
                                    : 'Nenhuma turma encontrada. Tente mudar a busca ou os filtros.'}
                            </p>
                        )}
                        {data && data.total > 0 && (
                            <nav
                                aria-label="Paginação das turmas"
                                className="flex items-center justify-between gap-2 pb-8"
                            >
                                <Button
                                    variant="outline"
                                    disabled={offset === 0}
                                    onClick={() =>
                                        setFilters((current) => ({
                                            ...current,
                                            offset: Math.max(0, offset - PAGE_SIZE)
                                        }))
                                    }
                                >
                                    Anterior
                                </Button>
                                <span className="text-center text-xs text-muted-foreground">
                                    {data.total} turmas
                                </span>
                                <Button
                                    variant="outline"
                                    disabled={offset + PAGE_SIZE >= data.total}
                                    onClick={() =>
                                        setFilters((current) => ({
                                            ...current,
                                            offset: offset + PAGE_SIZE
                                        }))
                                    }
                                >
                                    Próxima
                                </Button>
                            </nav>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
