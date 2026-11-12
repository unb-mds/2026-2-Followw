import { m } from 'motion/react';

import type { Classroom } from '#/queries/classrooms';
import type { UserProfile } from '#/queries/me';

import { AnimatedNumber } from '#/components/AnimatedNumber';
import { Card } from '#/components/ui/card';
import { ease, useEntrance } from '#/lib/motion';
import {
    curriculumProgress,
    projectedCategoryHours,
    projectedIntegralization
} from '#/lib/profile';
import { cn } from '#/lib/shadcn';

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
    const forecast = projectedCategoryHours(classrooms);
    const entrance = useEntrance();
    // o anel se desenha a partir do zero, no mesmo tempo da contagem
    const draw = (percent: number) => ({
        initial: entrance.initial && { strokeDasharray: '0 100' },
        animate: { strokeDasharray: `${percent} 100` },
        transition: { duration: 0.6, ease }
    });
    const categories = workload && [
        {
            label: 'Obrigatórias',
            pending: workload.pending_mandatory,
            required: workload.mandatory,
            projected: forecast.mandatory
        },
        {
            label: 'Optativas',
            pending: workload.pending_optional,
            required: workload.optional,
            projected: forecast.optional
        },
        {
            label: 'Complementares',
            pending: workload.pending_complementary,
            required: workload.complementary,
            projected: 0
        }
    ];
    const showForecast =
        projected != null || !!categories?.some((category) => categoryForecast(category) != null);

    return (
        <Card size="sm" className="gap-0 divide-y divide-border px-5 py-4">
            {(integralization != null || progress) && (
                <div className="pb-5">
                    {(integralization != null || showForecast) && (
                        <div className="mb-3 flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-2">
                                <span
                                    aria-hidden="true"
                                    className="h-1 w-5 rounded-full bg-primary"
                                />
                                Concluído
                            </span>
                            {showForecast && (
                                <span className="flex items-center gap-2">
                                    <span
                                        aria-hidden="true"
                                        className="h-1 w-5 rounded-full bg-info"
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
                                        <m.circle
                                            cx="50"
                                            cy="50"
                                            r="44"
                                            fill="none"
                                            stroke="var(--info)"
                                            strokeWidth="8"
                                            strokeLinecap="round"
                                            pathLength="100"
                                            {...draw(projected)}
                                        />
                                    )}
                                    {integralization > 0 && (
                                        <m.circle
                                            cx="50"
                                            cy="50"
                                            r="44"
                                            fill="none"
                                            stroke="var(--primary)"
                                            strokeWidth="8"
                                            strokeLinecap="round"
                                            pathLength="100"
                                            {...draw(Math.min(100, integralization))}
                                        />
                                    )}
                                </svg>
                                <span
                                    aria-hidden="true"
                                    className="text-2xl font-medium tabular-nums"
                                >
                                    <AnimatedNumber
                                        value={integralization}
                                        format={(value) =>
                                            // inteiro durante a contagem, exato ao final
                                            (value === integralization
                                                ? value
                                                : Math.round(value)
                                            ).toLocaleString('pt-BR')
                                        }
                                    />
                                    %
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
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">Integralização do curso</p>
                        )}
                    </div>
                </div>
            )}
            {categories && (
                <dl className="flex flex-col gap-4 py-4 last:pb-0">
                    {categories.map((category) => (
                        <CategoryProgress key={category.label} {...category} />
                    ))}
                    {!progress && workload && (
                        <div className="flex items-baseline justify-between gap-4">
                            <dt className="text-sm text-muted-foreground">Total do currículo</dt>
                            <dd className="text-sm font-medium tabular-nums">
                                {hoursLabel(workload.total)}
                            </dd>
                        </div>
                    )}
                </dl>
            )}
        </Card>
    );
}

interface Category {
    label: string;
    pending: number;
    required: number | null;
    projected: number;
}

const percentOf = (hours: number, required: number) => Math.min(100, (hours / required) * 100);

// largura prevista da barra, só quando avança além do concluído
function categoryForecast({ pending, required, projected }: Category) {
    if (!required || projected <= 0) return null;
    const completed = Math.max(0, required - pending);
    const forecast = percentOf(completed + projected, required);
    return forecast > percentOf(completed, required) ? forecast : null;
}

function CategoryProgress(category: Category) {
    const { label, pending, required } = category;
    // Sem a matriz, mostra só o que falta.
    if (required == null)
        return <CategoryRow label={label} value={`${hoursLabel(pending)} pendentes`} />;
    if (required === 0) return <CategoryRow label={label} value="Não exigido" muted />;

    const completed = Math.max(0, required - pending);
    const forecast = categoryForecast(category);
    return (
        <div className="flex flex-col gap-2">
            <CategoryRow
                label={label}
                value={`${hoursLabel(completed)} / ${hoursLabel(required)}`}
            />
            <div aria-hidden="true" className="relative h-2 overflow-hidden rounded-full bg-muted">
                {forecast != null && (
                    <div
                        className="absolute inset-y-0 left-0 rounded-full bg-info"
                        style={{ width: `${forecast}%` }}
                    />
                )}
                <div
                    className="relative h-full rounded-full bg-primary"
                    style={{ width: `${percentOf(completed, required)}%` }}
                />
            </div>
        </div>
    );
}

function CategoryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd
                className={cn(
                    'text-sm tabular-nums',
                    muted ? 'text-muted-foreground' : 'font-medium'
                )}
            >
                {value}
            </dd>
        </div>
    );
}
