import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Building2, CalendarDays, Clock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Turno } from '#/queries/search-classrooms';

import { HeaderBar, HeaderTitle } from '#/components/HeaderBar';
import { FilterSelect } from '#/components/search/FilterSelect';
import { TurmaSection } from '#/components/search/TurmaSection';
import { Input } from '#/components/ui/input';
import {
    CAMPI,
    filterTurmas,
    isTurno,
    searchClassroomsQueryOptions,
    SEMESTRES,
    TURNOS
} from '#/queries/search-classrooms';

export const Route = createFileRoute('/_app/buscar')({
    head: () => ({ meta: [{ title: 'Buscar Turmas | Followw' }] }),
    staticData: {
        header: () => (
            <HeaderBar>
                <HeaderTitle>Buscar Turmas</HeaderTitle>
            </HeaderBar>
        )
    },
    component: BuscarTurmasPage
});

function BuscarTurmasPage() {
    const [busca, setBusca] = useState('');
    const [semestre, setSemestre] = useState<string>(SEMESTRES[0]);
    const [campus, setCampus] = useState<string>('Gama');
    const [turno, setTurno] = useState<Turno>('Manhã');

    const { data: turmas = [] } = useQuery(searchClassroomsQueryOptions());

    const filtradas = useMemo(
        () => filterTurmas(turmas, { busca, semestre, campus, turno }),
        [turmas, busca, semestre, campus, turno]
    );

    const disponiveis = useMemo(() => filtradas.filter((t) => t.disponivel), [filtradas]);
    const indisponiveis = useMemo(() => filtradas.filter((t) => !t.disponivel), [filtradas]);

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
                    placeholder="Busque por matéria, código ou local..."
                    aria-label="Busque por matéria, código ou local"
                    className="h-11 rounded-2xl bg-card pl-10 text-sm"
                />
            </div>

            <div className="grid grid-cols-3 gap-2">
                <FilterSelect
                    label="Semestre"
                    icon={<CalendarDays className="size-4" />}
                    value={semestre}
                    options={SEMESTRES}
                    onChange={setSemestre}
                />
                <FilterSelect
                    label="Campus"
                    icon={<Building2 className="size-4" />}
                    value={campus}
                    options={CAMPI}
                    onChange={setCampus}
                />
                <FilterSelect
                    label="Turno"
                    icon={<Clock className="size-4" />}
                    value={turno}
                    options={TURNOS}
                    onChange={(v) => {
                        if (isTurno(v)) setTurno(v);
                    }}
                />
            </div>

            <TurmaSection title="Turmas disponíveis para o próximo semestre" turmas={disponiveis} />
            <TurmaSection title="Turmas indisponíveis no momento" turmas={indisponiveis} />

            {filtradas.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma turma encontrada. Tente mudar a busca ou os filtros.
                </p>
            )}

            <p className="pb-8 text-center text-xs text-muted-foreground">
                Mostrando {filtradas.length} de {turmas.length} turmas
            </p>
        </div>
    );
}
