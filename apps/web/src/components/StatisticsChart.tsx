import type {
    StatisticsShare,
    StatisticsSituation
} from '@followw/core/queries/subject-statistics.ts';

import { shareLabel, situationLabels } from '@followw/core/queries/subject-statistics.ts';
import { Pie, PieChart } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';

const withColor = (situation: StatisticsSituation, value: string) => ({
    label: situationLabels[situation],
    color: value
});

const situations: Record<StatisticsSituation, { label: string; color: string }> = {
    aprovado: withColor('aprovado', 'var(--color-success)'),
    reprovado: withColor('reprovado', 'var(--color-destructive)'),
    reprovado_por_faltas: withColor('reprovado_por_faltas', 'var(--color-warning)'),
    reprovado_por_media_e_por_faltas: withColor(
        'reprovado_por_media_e_por_faltas',
        'var(--color-rose-500)'
    ),
    aprovado_por_nota: withColor('aprovado_por_nota', 'var(--color-primary)'),
    reprovado_por_nota: withColor('reprovado_por_nota', 'var(--color-red-700)'),
    reprovado_por_nota_e_faltas: withColor(
        'reprovado_por_nota_e_faltas',
        'var(--color-purple-500)'
    ),
    trancado: withColor('trancado', 'var(--color-muted-foreground)'),
    matriculado: withColor('matriculado', 'var(--color-blue-500)')
};

const isSituation = (value: unknown): value is StatisticsSituation =>
    typeof value === 'string' && value in situations;

const formatTooltip: NonNullable<React.ComponentProps<typeof ChartTooltipContent>['formatter']> = (
    value,
    name
) => (
    <span>
        {isSituation(name) ? situationLabels[name] : name}: {shareLabel(Number(value))}
    </span>
);

export function StatisticsChart({ data, label }: { data: StatisticsShare[]; label: string }) {
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
                        <span className="flex-1">{situationLabels[share.situation]}</span>
                        <span className="font-medium tabular-nums">
                            {shareLabel(share.percentage)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
