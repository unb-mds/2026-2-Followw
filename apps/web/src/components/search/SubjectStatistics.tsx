import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pie, PieChart } from 'recharts';

import type { components } from '#/queries/schema.gen';
import type { SubjectClassroom } from '#/queries/subjects';

import { TabFilter } from '#/components/TabFilter';
import { Button } from '#/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';
import { subjectStatisticsQueryOptions } from '#/queries/subject-statistics';

type Situation = components['schemas']['StatisticsShare']['situation'];

const situations: Record<Situation, { label: string; color: string }> = {
    aprovado: { label: 'Aprovado', color: 'var(--color-success)' },
    reprovado: { label: 'Reprovado', color: 'var(--color-destructive)' },
    reprovado_por_faltas: { label: 'Reprovado por faltas', color: 'var(--color-warning)' },
    reprovado_por_media_e_por_faltas: {
        label: 'Reprovado por média e faltas',
        color: 'var(--color-rose-500)'
    },
    aprovado_por_nota: { label: 'Aprovado por nota', color: 'var(--color-primary)' },
    reprovado_por_nota: { label: 'Reprovado por nota', color: 'var(--color-red-700)' },
    reprovado_por_nota_e_faltas: {
        label: 'Reprovado por nota e faltas',
        color: 'var(--color-purple-500)'
    },
    trancado: { label: 'Trancado', color: 'var(--color-muted-foreground)' },
    matriculado: { label: 'Matriculado', color: 'var(--color-blue-500)' }
};

const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const formatTooltip: NonNullable<React.ComponentProps<typeof ChartTooltipContent>['formatter']> = (
    value,
    name
) => (
    <span>
        {Object.entries(situations).find(([key]) => key === name)?.[1].label ?? name}:{' '}
        {percentage.format(Number(value))}%
    </span>
);

export function SubjectStatistics({
    code,
    classroom
}: {
    code: string;
    classroom: SubjectClassroom;
}) {
    const query = useQuery(subjectStatisticsQueryOptions(code, classroom));
    const [selected, setSelected] = useState('overall');
    const data = query.data;
    const period =
        selected === 'overall'
            ? data?.overall
            : data?.semesters.find((s) => s.semester === selected);
    const shares = period?.shares
        .filter((share) => share.percentage > 0)
        .map((share) => ({
            situation: share.situation,
            percentage: share.percentage,
            fill: situations[share.situation].color
        }));

    return (
        <section
            className="flex flex-col gap-3 rounded-xl border p-4"
            aria-label="Estatísticas anteriores"
        >
            <h3 className="text-sm font-semibold">Estatísticas anteriores</h3>
            {query.isPending ? (
                <output className="text-sm text-muted-foreground">Carregando estatísticas…</output>
            ) : null}
            {query.isError ? (
                <div className="flex flex-col items-start gap-2">
                    <p className="text-sm text-muted-foreground" role="alert">
                        Não foi possível carregar as estatísticas.
                    </p>
                    <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                        Tentar novamente
                    </Button>
                </div>
            ) : null}
            {data && !data.semesters.length ? (
                <p className="text-sm text-muted-foreground">
                    Não há estatísticas de semestres anteriores para esta matéria com os mesmos
                    docentes.
                </p>
            ) : null}
            {data && data.semesters.length > 0 ? (
                <>
                    <TabFilter
                        label="Período das estatísticas"
                        value={selected}
                        options={[
                            'overall',
                            ...data.semesters.flatMap(({ semester }) =>
                                semester ? [semester] : []
                            )
                        ]}
                        labels={{ overall: 'Média geral' }}
                        onChange={setSelected}
                    />
                    {period && shares ? (
                        <div
                            className="flex flex-col gap-3"
                            aria-label={`Situação dos discentes · ${period.semester ?? 'Média geral'}`}
                        >
                            <ChartContainer
                                config={situations}
                                className="mx-auto aspect-square h-52 w-full"
                            >
                                <PieChart>
                                    <ChartTooltip
                                        content={
                                            <ChartTooltipContent
                                                nameKey="situation"
                                                hideLabel
                                                formatter={formatTooltip}
                                            />
                                        }
                                    />
                                    <Pie
                                        data={shares}
                                        dataKey="percentage"
                                        nameKey="situation"
                                        innerRadius="45%"
                                        outerRadius="85%"
                                        isAnimationActive={false}
                                    />
                                </PieChart>
                            </ChartContainer>
                            <ul className="flex flex-col gap-2 text-xs">
                                {shares.map((share) => (
                                    <li key={share.situation} className="flex items-center gap-2">
                                        <span
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: share.fill }}
                                            aria-hidden="true"
                                        />
                                        <span className="flex-1">
                                            {situations[share.situation].label}
                                        </span>
                                        <span className="font-medium tabular-nums">
                                            {percentage.format(share.percentage)}%
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
