import type { Classroom } from '#/queries/classrooms';
import type { UserProfile } from '#/queries/me';

import { Card } from '#/components/ui/card';
import { curriculumProgress, projectedIntegralization } from '#/lib/profile';

const hoursLabel = (hours: number) => `${hours.toLocaleString('pt-BR')}h`;
const NO_CLASSROOMS: readonly Classroom[] = [];

export function CourseProgress({
    user,
    classrooms = NO_CLASSROOMS
}: {
    user: UserProfile;
    classrooms?: readonly Classroom[];
}) {
    const { integralization, workload } = user;
    const progress = curriculumProgress(workload);
    const projected = projectedIntegralization(user, classrooms);
    const pending = workload && [
        { label: 'Obrigatórias', hours: workload.pending_mandatory },
        { label: 'Optativas', hours: workload.pending_optional },
        { label: 'Complementares', hours: workload.pending_complementary }
    ];

    return (
        <Card size="sm" className="gap-0 divide-y divide-border px-5 py-4">
            {(integralization != null || progress) && (
                <div className="pb-5">
                    {integralization != null && (
                        <div className="mb-3 flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                                <span
                                    aria-hidden="true"
                                    className="h-1 w-5 rounded-full bg-primary"
                                />
                                Concluído
                            </span>
                            {projected != null && (
                                <span className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className="h-1 w-5 rounded-full bg-primary-forecast"
                                    />
                                    Previsto
                                </span>
                            )}
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-5">
                        {integralization != null && (
                            <div className="relative flex size-28 shrink-0 items-center justify-center">
                                <svg
                                    viewBox="0 0 100 100"
                                    className="absolute inset-0 size-full -rotate-90"
                                >
                                    <title>{`Integralização do curso: ${integralization.toLocaleString('pt-BR')}%${projected != null ? '. Previsto: avanço com as disciplinas do semestre atual.' : ''}`}</title>
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="44"
                                        fill="none"
                                        stroke="var(--muted)"
                                        strokeWidth="8"
                                    />
                                    {projected != null && (
                                        <circle
                                            cx="50"
                                            cy="50"
                                            r="44"
                                            fill="none"
                                            stroke="var(--primary-forecast)"
                                            strokeWidth="8"
                                            strokeLinecap="round"
                                            pathLength="100"
                                            strokeDasharray={`${projected} 100`}
                                        />
                                    )}
                                    {integralization > 0 && (
                                        <circle
                                            cx="50"
                                            cy="50"
                                            r="44"
                                            fill="none"
                                            stroke="var(--primary)"
                                            strokeWidth="8"
                                            strokeLinecap="round"
                                            pathLength="100"
                                            strokeDasharray={`${Math.min(100, integralization)} 100`}
                                        />
                                    )}
                                </svg>
                                <span
                                    aria-hidden="true"
                                    className="text-2xl font-medium tabular-nums"
                                >
                                    {integralization.toLocaleString('pt-BR')}%
                                </span>
                            </div>
                        )}
                        {progress ? (
                            <div className="min-w-0">
                                <p className="text-3xl font-medium tracking-tight tabular-nums">
                                    {hoursLabel(progress.completed)}
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    de {hoursLabel(progress.total)} concluídas
                                </p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Faltam {hoursLabel(progress.pending)}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Integralização do curso</p>
                        )}
                    </div>
                </div>
            )}
            {pending && (
                <div className="py-4 last:pb-0">
                    <h3 className="mb-4 text-sm font-medium">Horas pendentes</h3>
                    <dl className="flex flex-col gap-4">
                        {pending.map(({ label, hours }) => (
                            <div key={label} className="flex items-baseline justify-between gap-4">
                                <dt className="text-sm text-muted-foreground">{label}</dt>
                                <dd className="text-sm font-medium tabular-nums">
                                    {hoursLabel(hours)}
                                </dd>
                            </div>
                        ))}
                        {!progress && workload && (
                            <div className="flex items-baseline justify-between gap-4">
                                <dt className="text-sm text-muted-foreground">
                                    Total do currículo
                                </dt>
                                <dd className="text-sm font-medium tabular-nums">
                                    {hoursLabel(workload.total)}
                                </dd>
                            </div>
                        )}
                    </dl>
                </div>
            )}
        </Card>
    );
}
