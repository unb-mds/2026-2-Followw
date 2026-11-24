import { Funnel } from 'lucide-react';
import { useId } from 'react';

import { Button } from '#/components/ui/button';
import { Checkbox } from '#/components/ui/checkbox';
import { Label } from '#/components/ui/label';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '#/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group';
import { startTimes, useSearchState, workloads } from '#/lib/search-params';

const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label, index) => ({
    label,
    value: String(index)
}));
const startOptions = startTimes.map((time) => ({ label: time, value: time }));
const workloadOptions = [
    ...workloads.map((value) => ({ label: `${value}h`, value: String(value) })),
    { label: '90h+', value: '90+' }
];
const kinds = [
    { label: 'Obrigatórias', value: 'mandatory' },
    { label: 'Optativas', value: 'electives' },
    { label: 'Livres', value: 'freeModules' }
] as const;

function FilterChoices({
    label,
    options,
    values,
    onChange
}: {
    label: string;
    options: readonly { label: string; value: string }[];
    values: string[];
    onChange: (values: string[]) => void;
}) {
    return (
        <fieldset>
            <legend className="mb-2 font-medium">{label}</legend>
            <ToggleGroup
                multiple
                size="sm"
                variant="outline"
                className="flex-wrap gap-1"
                value={values}
                onValueChange={(selected) => onChange(selected.toSorted())}
            >
                {options.map((option) => (
                    <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                    >
                        {option.label}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
        </fieldset>
    );
}

export function SubjectFilters() {
    const [filters, setSearch] = useSearchState();
    const { days, start, hours, hideConflicts, hideUnavailable, unit } = filters;
    const hideConflictsId = useId();
    const hideUnavailableId = useId();
    const selectedKinds = kinds.filter(({ value }) => filters[value]).map(({ value }) => value);
    const active = Boolean(
        days ||
        start.length ||
        hours.length ||
        selectedKinds.length ||
        hideConflicts ||
        hideUnavailable ||
        unit
    );
    return (
        <Popover>
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
            <PopoverContent
                align="end"
                className="max-h-(--available-height) w-96 max-w-(--available-width) gap-4 overflow-y-auto p-4"
            >
                <PopoverTitle>Filtros de matérias</PopoverTitle>
                <FilterChoices
                    label="Dias da semana"
                    options={weekdays}
                    values={days.split('')}
                    onChange={(values) => void setSearch({ days: values.join('') })}
                />
                <FilterChoices
                    label="Tipo de matéria"
                    options={kinds}
                    values={selectedKinds}
                    onChange={(values) =>
                        void setSearch({
                            mandatory: values.includes('mandatory'),
                            electives: values.includes('electives'),
                            freeModules: values.includes('freeModules')
                        })
                    }
                />
                <FilterChoices
                    label="Hora de início"
                    options={startOptions}
                    values={start}
                    onChange={(values) => void setSearch({ start: values })}
                />
                <FilterChoices
                    label="Carga horária"
                    options={workloadOptions}
                    values={hours.map(String)}
                    onChange={(values) =>
                        void setSearch({
                            hours: values.map((value) => (value === '90+' ? value : Number(value)))
                        })
                    }
                />
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={hideConflictsId}
                        checked={hideConflicts}
                        onCheckedChange={(checked) => void setSearch({ hideConflicts: checked })}
                    />
                    <Label htmlFor={hideConflictsId}>Ocultar conflitos de horário</Label>
                </div>
                <div className="flex items-center gap-2">
                    <Checkbox
                        id={hideUnavailableId}
                        checked={hideUnavailable}
                        onCheckedChange={(checked) => void setSearch({ hideUnavailable: checked })}
                    />
                    <Label htmlFor={hideUnavailableId}>Ocultar turmas indisponíveis</Label>
                </div>
                {active && (
                    <Button
                        variant="outline"
                        onClick={() =>
                            void setSearch({
                                days: null,
                                start: null,
                                hours: null,
                                mandatory: null,
                                electives: null,
                                freeModules: null,
                                hideConflicts: null,
                                hideUnavailable: null,
                                unit: null
                            })
                        }
                    >
                        Limpar filtros
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
}
