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
import { ChevronDown } from 'lucide-react';
import { lazy, Suspense, useSyncExternalStore } from 'react';

import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import { Button } from '#/components/ui/button';
import { Card } from '#/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '#/components/ui/select';
import { Skeleton } from '#/components/ui/skeleton';
import { simulatedGrades } from '#/lib/academic-simulation';
import { repeat } from '#/lib/repeat';

const AcademicSimulatorChart = lazy(() =>
    import('#/components/profile/AcademicSimulatorChart').then((module) => ({
        default: module.AcademicSimulatorChart
    }))
);

const gradeItems = [
    { value: null, label: 'Sem menção' },
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
    const overrides = useSyncExternalStore(
        simulatedGrades.subscribe,
        simulatedGrades.getSnapshot,
        simulatedGrades.getServerSnapshot
    );
    const groups = groupBySemester(simulationClassrooms(classrooms, entry, current));
    const currentClassrooms = groups.find(([semester]) => semester === current)?.[1] ?? [];
    const previous = groups.filter(([semester]) => semester !== current);
    const { ira, mp, evolution } = simulateIndexes(groups, entry, current, curriculum, overrides);
    const projected = evolution.at(-1)?.projected === true;

    function rows(items: Classroom[]) {
        return (
            <ul className="divide-y divide-border">
                {items.map((classroom) => {
                    const name = titleCase(classroom.subject.name);
                    return (
                        <li key={simulationKey(classroom)}>
                            <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="font-medium wrap-anywhere">{name}</span>
                                    {isFreeModule(classroom, curriculum) && (
                                        <span className="text-xs text-muted-foreground">
                                            Módulo livre
                                        </span>
                                    )}
                                </span>
                                <Select
                                    items={gradeItems}
                                    value={simulationGrade(classroom, overrides) ?? null}
                                    onValueChange={(value) =>
                                        changeGrade(
                                            classroom,
                                            value && isGrade(value) ? value : null
                                        )
                                    }
                                >
                                    <SelectTrigger
                                        aria-label={`Menção de ${name}, ${classroom.semester}`}
                                        className="h-9 shrink-0 bg-background"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {gradeItems.map((item) => (
                                            <SelectItem key={item.label} value={item.value}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div className="my-4 flex flex-col gap-4">
            <Card className="gap-3 px-4">
                <dl className="grid grid-cols-2 gap-4" aria-live="polite">
                    <div>
                        <dt className="text-muted-foreground">IRA</dt>
                        <dd className="text-2xl font-semibold text-primary tabular-nums">
                            {displayIndex(ira)}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground">MP</dt>
                        <dd className="text-2xl font-semibold text-primary tabular-nums">
                            {displayIndex(mp)}
                        </dd>
                    </div>
                </dl>
                {!entry && (
                    <p className="text-xs text-muted-foreground">
                        IRA indisponível sem o semestre de ingresso.
                    </p>
                )}
                {!curriculum && (
                    <p className="text-xs text-muted-foreground">
                        MP indisponível sem a matriz curricular.
                    </p>
                )}
                <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    disabled={Object.keys(overrides).length === 0}
                    onClick={simulatedGrades.clear}
                >
                    Limpar simulação
                </Button>
            </Card>
            <section aria-labelledby="simulator-current">
                <h2 id="simulator-current" className="mb-2 px-1 text-sm font-semibold">
                    Semestre atual{current && ` · ${current}`}
                </h2>
                <Card className="py-0">
                    {currentClassrooms.length ? (
                        rows(currentClassrooms)
                    ) : (
                        <p className="p-4 text-muted-foreground">
                            Nenhuma disciplina no semestre atual.
                        </p>
                    )}
                </Card>
            </section>
            {previous.length > 0 && (
                <details className="group overflow-hidden rounded-2xl bg-card text-sm shadow-card ring-1 ring-foreground/8">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset">
                        Semestres anteriores
                        <ChevronDown
                            className="size-4 text-muted-foreground group-open:rotate-180"
                            aria-hidden="true"
                        />
                    </summary>
                    {previous.map(([semester, items]) => (
                        <section key={semester} className="border-t border-border">
                            <h3 className="px-4 pt-3 text-sm font-semibold">{semester}</h3>
                            {rows(items)}
                        </section>
                    ))}
                </details>
            )}
            <section aria-labelledby="simulator-evolution">
                <h2 id="simulator-evolution" className="mb-2 px-1 text-sm font-semibold">
                    Evolução do IRA
                </h2>
                <Card className="gap-2 px-4">
                    {evolution.length === 0 ? (
                        <p className="text-muted-foreground">
                            A evolução aparece quando houver menções para calcular o IRA.
                        </p>
                    ) : (
                        <Suspense
                            fallback={
                                <LoadingSkeleton label="Carregando gráfico...">
                                    <Skeleton className="h-56 w-full" />
                                </LoadingSkeleton>
                            }
                        >
                            <AcademicSimulatorChart
                                evolution={evolution}
                                projected={projected}
                                current={current}
                            />
                        </Suspense>
                    )}
                    {projected && (
                        <p className="text-xs text-muted-foreground">* Projeção para {current}.</p>
                    )}
                </Card>
            </section>
        </div>
    );
}

export function AcademicSimulatorSkeleton() {
    return (
        <div className="my-4 flex flex-col gap-4">
            <Card className="gap-3 px-4">
                <div className="grid grid-cols-2 gap-4">
                    {repeat(2, () => (
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-4 w-10" />
                            <Skeleton className="h-8 w-16" />
                        </div>
                    ))}
                </div>
                <Skeleton className="h-9 w-36" />
            </Card>
            <div className="flex flex-col gap-2">
                <Skeleton className="mx-1 h-4 w-40" />
                <Card className="gap-0 divide-y divide-border py-0">
                    {repeat(5, () => (
                        <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-9 w-20" />
                        </div>
                    ))}
                </Card>
            </div>
        </div>
    );
}
