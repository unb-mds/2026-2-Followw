import type { components } from '@followw/core/queries/schema.gen.ts';

import { Combobox } from '@base-ui/react/combobox';
import { SCHEDULE_SLOTS } from '@followw/core/lib/schedule.ts';
import {
    subjectUnitsQueryOptions,
    subjectWorkloadsQueryOptions
} from '@followw/core/queries/subjects.ts';
import { useQuery } from '@tanstack/react-query';
import { Funnel, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '#/components/ui/button';
import { Input } from '#/components/ui/input';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '#/components/ui/popover';
import { useSearchState } from '#/lib/search-params';

const selectClass = 'mt-1 h-9 w-full rounded-md border bg-background px-2';
type Department = components['schemas']['UnitRef'];
const departmentLabel = ({ code, name }: Department) => (code ? `${code} · ${name}` : name);
const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function SubjectFilters() {
    const [{ days, start, unit, hours }, setSearch] = useSearchState();
    const [open, setOpen] = useState(false);
    const units = useQuery({ ...subjectUnitsQueryOptions, enabled: open });
    const workloads = useQuery({ ...subjectWorkloadsQueryOptions, enabled: open });
    const departments = units.data ?? [];
    const active = Boolean(days || start || unit || hours);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                render={
                    <Button
                        variant={active ? 'default' : 'ghost'}
                        size="icon"
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full"
                        aria-label={active ? 'Filtros de matérias ativos' : 'Filtros de matérias'}
                    />
                }
            >
                <Funnel aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="end" className="gap-4 p-4">
                <PopoverTitle>Filtros de matérias</PopoverTitle>
                <fieldset>
                    <legend className="mb-2">Dias exatos da semana</legend>
                    <div className="flex flex-wrap gap-1">
                        {weekdays.map((label, index) => {
                            const day = String(index);
                            const selected = days.includes(day);
                            return (
                                <Button
                                    key={day}
                                    variant={selected ? 'default' : 'outline'}
                                    size="sm"
                                    aria-pressed={selected}
                                    onClick={() =>
                                        void setSearch({
                                            days: selected
                                                ? days.replace(day, '')
                                                : (days + day).split('').toSorted().join('')
                                        })
                                    }
                                >
                                    {label}
                                </Button>
                            );
                        })}
                    </div>
                </fieldset>
                <label htmlFor="subject-start">
                    Hora de início
                    <select
                        id="subject-start"
                        className={selectClass}
                        value={start}
                        onChange={(e) => void setSearch({ start: e.target.value })}
                    >
                        <option value="">Qualquer horário</option>
                        {SCHEDULE_SLOTS.map(([time]) => (
                            <option key={time}>{time}</option>
                        ))}
                    </select>
                </label>
                <Combobox.Root
                    items={departments}
                    value={
                        departments.find(
                            (department) =>
                                String(department.id) === unit || department.code === unit
                        ) ?? null
                    }
                    onValueChange={(department) =>
                        void setSearch({ unit: department ? String(department.id) : null })
                    }
                    itemToStringLabel={departmentLabel}
                    isItemEqualToValue={(item, value) => item.id === value.id}
                    disabled={units.isPending || units.isLoadingError}
                >
                    <div>
                        <label htmlFor="subject-unit">Departamento</label>
                        <div className="relative">
                            <Combobox.Input
                                id="subject-unit"
                                render={<Input className="pr-9" />}
                                placeholder={
                                    units.isPending
                                        ? 'Carregando departamentos…'
                                        : 'Buscar por nome ou sigla'
                                }
                            />
                            <Combobox.Clear
                                aria-label="Limpar departamento"
                                className="absolute inset-y-0 right-0 px-2"
                            >
                                <X className="size-4" />
                            </Combobox.Clear>
                        </div>
                    </div>
                    <Combobox.Portal>
                        <Combobox.Positioner sideOffset={4} className="z-50 w-(--anchor-width)">
                            <Combobox.Popup className="rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md">
                                <Combobox.Empty className="not-empty:px-2 not-empty:py-1">
                                    Nenhum departamento encontrado.
                                </Combobox.Empty>
                                <Combobox.List className="max-h-48 overflow-y-auto">
                                    {(department: Department) => (
                                        <Combobox.Item
                                            key={department.id}
                                            value={department}
                                            className="cursor-pointer rounded-md px-2 py-1.5 data-highlighted:bg-accent"
                                        >
                                            {departmentLabel(department)}
                                        </Combobox.Item>
                                    )}
                                </Combobox.List>
                            </Combobox.Popup>
                        </Combobox.Positioner>
                    </Combobox.Portal>
                </Combobox.Root>
                {units.isError && (
                    <button type="button" onClick={() => void units.refetch()}>
                        Tentar carregar os departamentos novamente
                    </button>
                )}
                <label htmlFor="subject-hours">
                    Carga horária (horas)
                    <select
                        id="subject-hours"
                        className={selectClass}
                        value={hours ?? ''}
                        disabled={workloads.isPending || workloads.isLoadingError}
                        onChange={(e) =>
                            void setSearch({
                                hours: e.target.value ? Number(e.target.value) : null
                            })
                        }
                    >
                        <option value="">
                            {workloads.isPending ? 'Carregando…' : 'Qualquer carga horária'}
                        </option>
                        {workloads.data?.map((value) => (
                            <option key={value} value={value}>
                                {value} h
                            </option>
                        ))}
                    </select>
                </label>
                {workloads.isError && (
                    <button type="button" onClick={() => void workloads.refetch()}>
                        Tentar carregar as cargas horárias novamente
                    </button>
                )}
                {active && (
                    <Button
                        variant="outline"
                        onClick={() =>
                            void setSearch({ days: null, start: null, unit: null, hours: null })
                        }
                    >
                        Limpar filtros de matérias
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
}
