import type { Classroom } from '@followw/core/queries/classrooms.ts';

import {
    gradeWeights,
    isFreeModule,
    isGrade,
    simulateIndexes,
    simulationClassrooms,
    simulationGrade,
    simulationKey,
    type Grade
} from '@followw/core/lib/academic-simulation.ts';
import { groupBySemester } from '@followw/core/lib/classroom-details.ts';
import { formatAcademicIndex, titleCase } from '@followw/core/lib/profile.ts';
import { ChevronDown } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { repeat } from '@/components/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import { simulatedGrades } from '@/lib/academic-simulation';
import { useColor } from '@/lib/colors';
import { cn } from '@/lib/utils';

// o Select só trabalha com texto: "sem menção" vira um valor próprio
const NO_GRADE = 'none';
const gradeItems = [
    { value: NO_GRADE, label: 'Sem menção' },
    ...Object.keys(gradeWeights).map((grade) => ({ value: grade, label: grade }))
];
const displayIndex = (value: number | null) => (value === null ? '—' : formatAcademicIndex(value));

function changeGrade(classroom: Classroom, grade: Grade | null) {
    const next = { ...simulatedGrades.getSnapshot() };
    const key = simulationKey(classroom);
    if (grade === (classroom.grade ?? null)) delete next[key];
    else next[key] = grade;
    simulatedGrades.set(next);
}

export function AcademicSimulator({
    classrooms,
    entry,
    current,
    curriculum
}: {
    classrooms: Classroom[];
    entry: string | null;
    current: string | undefined;
    curriculum: Set<string> | null;
}) {
    const overrides = useSyncExternalStore(simulatedGrades.subscribe, simulatedGrades.getSnapshot);
    const [showPrevious, setShowPrevious] = useState(false);
    const groups = groupBySemester(simulationClassrooms(classrooms, entry, current));
    const currentClassrooms = groups.find(([semester]) => semester === current)?.[1] ?? [];
    const previous = groups.filter(([semester]) => semester !== current);
    const { ira, mp, evolution } = simulateIndexes(groups, entry, current, curriculum, overrides);
    const projected = evolution.at(-1)?.projected === true;

    function rows(items: Classroom[]) {
        return items.map((classroom, index) => {
            const name = titleCase(classroom.subject.name);
            const grade = simulationGrade(classroom, overrides) ?? NO_GRADE;
            return (
                <View
                    key={simulationKey(classroom)}
                    className={cn(
                        'min-h-14 flex-row items-center justify-between gap-3 px-4 py-2',
                        index > 0 && 'border-t border-border'
                    )}
                >
                    <View className="min-w-0 shrink gap-0.5">
                        <Text className="font-medium">{name}</Text>
                        {isFreeModule(classroom, curriculum) && (
                            <Text className="text-xs text-muted-foreground">Módulo livre</Text>
                        )}
                    </View>
                    <Select
                        items={gradeItems}
                        value={grade}
                        onValueChange={(value) =>
                            changeGrade(classroom, isGrade(value) ? value : null)
                        }
                    >
                        <SelectTrigger
                            accessibilityLabel={`Menção de ${name}, ${classroom.semester}`}
                            className="h-9 shrink-0 bg-background"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent title={name}>
                            {gradeItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                    {item.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </View>
            );
        });
    }

    return (
        <View className="my-4 gap-4">
            <Card className="gap-3 px-4">
                <View className="flex-row gap-4" aria-live="polite">
                    <View className="flex-1">
                        <Text className="text-muted-foreground">IRA</Text>
                        <Text className="text-2xl font-semibold text-primary">
                            {displayIndex(ira)}
                        </Text>
                    </View>
                    <View className="flex-1">
                        <Text className="text-muted-foreground">MP</Text>
                        <Text className="text-2xl font-semibold text-primary">
                            {displayIndex(mp)}
                        </Text>
                    </View>
                </View>
                {!entry && (
                    <Text className="text-xs text-muted-foreground">
                        IRA indisponível sem o semestre de ingresso.
                    </Text>
                )}
                {!curriculum && (
                    <Text className="text-xs text-muted-foreground">
                        MP indisponível sem a matriz curricular.
                    </Text>
                )}
                <Button
                    variant="outline"
                    className="self-start"
                    disabled={Object.keys(overrides).length === 0}
                    onPress={simulatedGrades.clear}
                >
                    <Text>Limpar simulação</Text>
                </Button>
            </Card>
            <View>
                <Text role="heading" aria-level={2} className="mb-2 px-1 text-sm font-semibold">
                    Semestre atual{current && ` · ${current}`}
                </Text>
                <Card className="gap-0 py-0">
                    {currentClassrooms.length ? (
                        rows(currentClassrooms)
                    ) : (
                        <Text className="p-4 text-muted-foreground">
                            Nenhuma disciplina no semestre atual.
                        </Text>
                    )}
                </Card>
            </View>
            {previous.length > 0 && (
                <Card className="gap-0 overflow-hidden py-0">
                    <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showPrevious }}
                        onPress={() => setShowPrevious(!showPrevious)}
                        className="flex-row items-center justify-between gap-2 px-4 py-3 active:bg-accent"
                    >
                        <Text className="font-semibold">Semestres anteriores</Text>
                        <Icon
                            as={ChevronDown}
                            className={cn(
                                'size-4 text-muted-foreground',
                                showPrevious && 'rotate-180'
                            )}
                        />
                    </Pressable>
                    {showPrevious &&
                        previous.map(([semester, items]) => (
                            <View key={semester} className="border-t border-border">
                                <Text
                                    role="heading"
                                    aria-level={3}
                                    className="px-4 pt-3 text-sm font-semibold"
                                >
                                    {semester}
                                </Text>
                                {rows(items)}
                            </View>
                        ))}
                </Card>
            )}
            <View>
                <Text role="heading" aria-level={2} className="mb-2 px-1 text-sm font-semibold">
                    Evolução do IRA
                </Text>
                <Card className="gap-2 px-4">
                    {evolution.length === 0 ? (
                        <Text className="text-muted-foreground">
                            A evolução aparece quando houver menções para calcular o IRA.
                        </Text>
                    ) : (
                        <EvolutionChart
                            evolution={evolution}
                            current={projected ? current : undefined}
                        />
                    )}
                    {projected && (
                        <Text className="text-xs text-muted-foreground">
                            * Projeção para {current}.
                        </Text>
                    )}
                </Card>
            </View>
        </View>
    );
}

const POINT_SPACING = 42;

function EvolutionChart({
    evolution,
    current
}: {
    evolution: { semester: string; ira: number }[];
    // semestre projetado, marcado com asterisco
    current?: string;
}) {
    const primary = useColor('primary');
    const muted = useColor('muted-foreground');
    const border = useColor('border');
    const data = evolution.map(({ semester, ira }) => ({
        value: ira,
        label: semester.slice(2) + (semester === current ? '*' : '')
    }));
    return (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View
                accessible
                accessibilityLabel={evolution
                    .map(({ semester, ira }) => `${semester}: IRA ${formatAcademicIndex(ira)}`)
                    .join(', ')}
            >
                <LineChart
                    data={data}
                    height={180}
                    maxValue={5}
                    noOfSections={5}
                    spacing={POINT_SPACING}
                    initialSpacing={16}
                    endSpacing={20}
                    color={primary}
                    thickness={2}
                    dataPointsColor={primary}
                    dataPointsRadius={3}
                    rulesColor={border}
                    rulesType="solid"
                    xAxisColor={border}
                    yAxisColor="transparent"
                    yAxisLabelWidth={24}
                    formatYLabel={(label) => String(Math.round(Number(label)))}
                    yAxisTextStyle={{ color: muted, fontSize: 12 }}
                    xAxisLabelTextStyle={{ color: muted, fontSize: 12 }}
                    isAnimated={false}
                    disableScroll
                />
            </View>
        </ScrollView>
    );
}

export function AcademicSimulatorSkeleton() {
    return (
        <View className="my-4 gap-4">
            <Card className="gap-3 px-4">
                <View className="flex-row gap-4">
                    {repeat(2, () => (
                        <View className="flex-1 gap-2">
                            <Skeleton className="h-4 w-10" />
                            <Skeleton className="h-8 w-16" />
                        </View>
                    ))}
                </View>
                <Skeleton className="h-9 w-36" />
            </Card>
            <View className="gap-2">
                <Skeleton className="mx-1 h-4 w-40" />
                <Card className="gap-0 py-0">
                    {repeat(5, (index) => (
                        <View
                            className={cn(
                                'min-h-14 flex-row items-center justify-between gap-3 px-4 py-2',
                                index > 0 && 'border-t border-border'
                            )}
                        >
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-9 w-20" />
                        </View>
                    ))}
                </Card>
            </View>
        </View>
    );
}
