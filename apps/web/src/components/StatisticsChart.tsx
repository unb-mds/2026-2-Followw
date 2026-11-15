import type { components } from '@followw/core/queries/schema.gen.ts';

import { Pie, PieChart } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';

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

const isSituation = (value: unknown): value is Situation =>
    typeof value === 'string' && value in situations;

const percentage = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

const formatTooltip: NonNullable<React.ComponentProps<typeof ChartTooltipContent>['formatter']> = (
    value,
    name
) => (
    <span>
        {isSituation(name) ? situations[name].label : name}: {percentage.format(Number(value))}%
    </span>
);

export function StatisticsChart({
    data,
    label
}: {
    data: components['schemas']['StatisticsShare'][];
    label: string;
}) {
    const shares = data
        .filter((share) => share.percentage > 0)
        .map((share) => ({
            situation: share.situation,
            percentage: share.percentage,
            fill: situations[share.situation].color
        }));

    return (
        <div className="flex flex-col gap-3" aria-label={label}>
            <ChartContainer config={situations} className="mx-auto aspect-square h-52 w-full">
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
                        innerRadius="76%"
                        outerRadius="86%"
                        cornerRadius={8}
                        paddingAngle={shares.length > 1 ? 4 : 0}
                        minAngle={4}
                        stroke="none"
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
                        <span className="flex-1">{situations[share.situation].label}</span>
                        <span className="font-medium tabular-nums">
                            {percentage.format(share.percentage)}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
