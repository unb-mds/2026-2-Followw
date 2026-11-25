import { GRID_DAYS } from '@followw/core/lib/planned-schedule.ts';
import {
    hasSubjectFilters,
    kindLabels,
    startTimes,
    workloads
} from '@followw/core/lib/subject-filters.ts';
import { SUBJECT_KINDS } from '@followw/core/queries/subjects.ts';
import { Funnel } from 'lucide-react-native';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Drawer,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger
} from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { clearSubjectFilters, setSubjectFilters, useSubjectFilters } from '@/lib/search-filters';
import { cn } from '@/lib/utils';

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
        <View className="gap-2" accessibilityLabel={label}>
            <Text className="font-medium">{label}</Text>
            <ToggleGroup
                type="multiple"
                size="sm"
                variant="outline"
                className="flex-wrap gap-1"
                value={values}
                onValueChange={(selected) => onChange(selected.toSorted())}
            >
                {options.map((option) => {
                    const pressed = values.includes(option.value);
                    return (
                        <ToggleGroupItem
                            key={option.value}
                            value={option.value}
                            aria-label={option.label}
                            className={cn(
                                'rounded-md border border-l',
                                pressed && 'border-primary bg-primary'
                            )}
                        >
                            <Text className={cn(pressed && 'text-primary-foreground')}>
                                {option.label}
                            </Text>
                        </ToggleGroupItem>
                    );
                })}
            </ToggleGroup>
        </View>
    );
}

function FilterCheckbox({
    label,
    checked,
    onChange
}: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <Pressable
            role="checkbox"
            aria-checked={checked}
            className="flex-row items-center gap-2"
            onPress={() => onChange(!checked)}
        >
            <Checkbox checked={checked} onCheckedChange={onChange} />
            <Text className="text-sm font-medium">{label}</Text>
        </Pressable>
    );
}

export function SubjectFilters() {
    const filters = useSubjectFilters();
    const { days, kind, start, hours, hideConflicts, hideUnavailable } = filters;
    const active = hasSubjectFilters(filters);
    const { height } = useWindowDimensions();
    return (
        <Drawer showSwipeHandle>
            <DrawerTrigger asChild>
                <Button
                    variant={active ? 'default' : 'ghost'}
                    size="icon"
                    className="absolute top-1 right-2 rounded-full"
                    accessibilityLabel={
                        active ? 'Filtros de matérias ativos' : 'Filtros de matérias'
                    }
                >
                    <Icon
                        as={Funnel}
                        className={cn('size-4', active && 'text-primary-foreground')}
                    />
                </Button>
            </DrawerTrigger>
            <DrawerContent className="mx-auto max-w-lg">
                <DrawerHeader className="border-b border-border">
                    <DrawerTitle>Filtros de matérias</DrawerTitle>
                </DrawerHeader>
                <ScrollView
                    style={{ maxHeight: height * 0.7 }}
                    contentContainerClassName="gap-4 p-4"
                >
                    <FilterChoices
                        label="Dias da semana"
                        options={weekdays}
                        values={days.split('').filter(Boolean)}
                        onChange={(values) => setSubjectFilters({ days: values.join('') })}
                    />
                    <FilterChoices
                        label="Tipo de matéria"
                        options={kinds}
                        values={kind}
                        onChange={(values) =>
                            setSubjectFilters({
                                kind: SUBJECT_KINDS.filter((value) => values.includes(value))
                            })
                        }
                    />
                    <FilterChoices
                        label="Hora de início"
                        options={startOptions}
                        values={start}
                        onChange={(values) => setSubjectFilters({ start: values })}
                    />
                    <FilterChoices
                        label="Carga horária"
                        options={workloadOptions}
                        values={hours.map(String)}
                        onChange={(values) =>
                            setSubjectFilters({
                                hours: values.map((value) =>
                                    value === '90+' ? value : Number(value)
                                )
                            })
                        }
                    />
                    <FilterCheckbox
                        label="Ocultar conflitos de horário"
                        checked={hideConflicts}
                        onChange={(checked) => setSubjectFilters({ hideConflicts: checked })}
                    />
                    <FilterCheckbox
                        label="Ocultar turmas indisponíveis"
                        checked={hideUnavailable}
                        onChange={(checked) => setSubjectFilters({ hideUnavailable: checked })}
                    />
                    {active && (
                        <Button variant="outline" onPress={clearSubjectFilters}>
                            <Text>Limpar filtros</Text>
                        </Button>
                    )}
                </ScrollView>
            </DrawerContent>
        </Drawer>
    );
}
