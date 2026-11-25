import { GRID_DAYS } from '@followw/core/lib/planned-schedule.ts';
import { SUBJECT_KINDS } from '@followw/core/queries/subjects.ts';
import { Funnel } from 'lucide-react';
import { useId } from 'react';

import { Button } from '#/components/ui/button';
import { Checkbox } from '#/components/ui/checkbox';
import { Label } from '#/components/ui/label';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '#/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group';
import {
    clearedSubjectFilters,
    hasSubjectFilters,
    kindLabels,
    startTimes,
    useSearchState,
    workloads
} from '#/lib/search-params';

// A API conta os dias de segunda (0) a domingo (6).
const weekdays = GRID_DAYS.map(({ label, weekday }) => ({ label, value: String(weekday - 1) }));
const startOptions = startTimes.map((time) => ({ label: time, value: time }));
const workloadOptions = [
    ...workloads.map((value) => ({ label: `${value}h`, value: String(value) })),
    { label: '90h+', value: '90+' }
];
const kinds = SUBJECT_KINDS.map((value) => ({ label: kindLabels[value], value }));

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
    const { days, kind, start, hours, hideConflicts, hideUnavailable } = filters;
    const hideConflictsId = useId();
    const hideUnavailableId = useId();
    const active = hasSubjectFilters(filters);
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
                    values={kind}
                    onChange={(values) =>
                        void setSearch({
                            kind: SUBJECT_KINDS.filter((value) => values.includes(value))
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
                    <Button variant="outline" onClick={() => void setSearch(clearedSubjectFilters)}>
                        Limpar filtros
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
}
