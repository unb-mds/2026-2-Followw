import { formatAcademicIndex } from '@followw/core/lib/profile.ts';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '#/components/ui/chart';

const chartConfig = { ira: { label: 'IRA', color: 'var(--primary)' } };

export interface EvolutionPoint {
    semester: string;
    ira: number;
}

export function AcademicSimulatorChart({
    evolution,
    projected,
    current
}: {
    evolution: EvolutionPoint[];
    projected: boolean;
    current?: string;
}) {
    return (
        <div className="overflow-x-auto">
            <ChartContainer
                config={chartConfig}
                className="h-56 w-full"
                style={{ minWidth: evolution.length * 42 + 44 }}
            >
                <LineChart data={evolution} margin={{ left: 0, right: 20, top: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                        dataKey="semester"
                        tickFormatter={(semester: string) =>
                            semester.slice(2) + (projected && semester === current ? '*' : '')
                        }
                        tickMargin={8}
                        interval={0}
                    />
                    <YAxis domain={[0, 5]} allowDecimals={false} width={24} />
                    <ChartTooltip
                        content={
                            <ChartTooltipContent
                                indicator="dot"
                                labelFormatter={(semester) =>
                                    projected &&
                                    typeof semester === 'string' &&
                                    semester === current
                                        ? `${semester} · Projeção`
                                        : semester
                                }
                                formatter={(value) => `IRA ${formatAcademicIndex(Number(value))}`}
                            />
                        }
                    />
                    <Line
                        dataKey="ira"
                        stroke="var(--color-ira)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        isAnimationActive={false}
                    />
                </LineChart>
            </ChartContainer>
        </div>
    );
}
