import {
    classroomFrequencyQueryOptions,
    classroomStatisticsQueryOptions
} from '@followw/core/queries/classrooms.ts';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import {
    FrequencySummary,
    FrequencySummarySkeleton
} from '@/components/classroom/FrequencyContent';
import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '@/components/ErrorState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { StatisticsChart } from '@/components/StatisticsChart';
import { StatisticsChartSkeleton } from '@/components/StatisticsChartSkeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';

export function ClassroomStatistics({ id }: { id: string }) {
    const statistics = useQuery(classroomStatisticsQueryOptions(id));
    const frequency = useQuery(classroomFrequencyQueryOptions(id));

    return (
        <View className="flex-col gap-4">
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
                                <StatisticsChart
                                    data={shares}
                                    label="Situação dos discentes desta turma"
                                />
                            ) : (
                                <Text className="text-center text-sm text-muted-foreground">
                                    Resultados desta turma indisponíveis
                                </Text>
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
        </View>
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
        <View>
            <Text role="heading" aria-level={3} className="mb-2 px-1 text-sm font-semibold">
                {title}
            </Text>
            {query.isPending ? (
                <LoadingSkeleton label={`Carregando ${subject}…`}>{skeleton}</LoadingSkeleton>
            ) : query.isLoadingError ? (
                <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => void query.refetch()} />
            ) : (
                <>
                    {query.isError && <StaleDataNotice subject={subject} className="mb-2" />}
                    {children(query.data)}
                </>
            )}
        </View>
    );
}
