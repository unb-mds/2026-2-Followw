import {
    classroomFrequencyQueryOptions,
    classroomStatisticsQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';

import {
    FrequencySummary,
    FrequencySummarySkeleton
} from '#/components/classroom/FrequencyContent';
import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '#/components/ErrorState';
import { LoadingSkeleton } from '#/components/LoadingSkeleton';
import { StatisticsChartSkeleton } from '#/components/StatisticsChartSkeleton';
import { Card, CardContent } from '#/components/ui/card';

const StatisticsChart = lazy(() =>
    import('#/components/StatisticsChart').then((module) => ({ default: module.StatisticsChart }))
);

export function ClassroomStatistics({ id }: { id: string }) {
    const statistics = useQuery(classroomStatisticsQueryOptions(id));
    const frequency = useQuery(classroomFrequencyQueryOptions(id));

    return (
        <div className="flex flex-col gap-4">
            <StatisticsSection
                title="Resultados da turma"
                subject="as estatísticas"
                query={statistics}
                skeleton={
                    <Card size="sm">
                        <CardContent>
                            <StatisticsChartSkeleton />
                        </CardContent>
                    </Card>
                }
            >
                {(shares) => (
                    <Card size="sm">
                        <CardContent>
                            {shares.some((share) => share.percentage > 0) ? (
                                <Suspense
                                    fallback={
                                        <LoadingSkeleton label="Carregando gráfico...">
                                            <StatisticsChartSkeleton />
                                        </LoadingSkeleton>
                                    }
                                >
                                    <StatisticsChart
                                        data={shares}
                                        label="Situação dos discentes desta turma"
                                    />
                                </Suspense>
                            ) : (
                                <p className="text-center text-sm text-muted-foreground">
                                    Resultados desta turma indisponíveis
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </StatisticsSection>
            <StatisticsSection
                title="Sua frequência"
                subject="a frequência"
                query={frequency}
                skeleton={<FrequencySummarySkeleton />}
            >
                {(data) => <FrequencySummary data={data} />}
            </StatisticsSection>
        </div>
    );
}

function StatisticsSection<T>({
    title,
    subject,
    query,
    skeleton,
    children
}: {
    title: string;
    subject: string;
    query: UseQueryResult<T, unknown>;
    skeleton: React.ReactNode;
    children: (data: T) => React.ReactNode;
}) {
    return (
        <section>
            <h3 className="mb-2 px-1 text-sm font-semibold">{title}</h3>
            {query.isPending ? (
                <LoadingSkeleton label={`Carregando ${subject}…`}>{skeleton}</LoadingSkeleton>
            ) : query.isLoadingError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => query.refetch()} />
            ) : (
                <>
                    {query.isError && <StaleDataNotice subject={subject} className="mb-2" />}
                    {children(query.data)}
                </>
            )}
        </section>
    );
}
