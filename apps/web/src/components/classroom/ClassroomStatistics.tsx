import { type UseQueryResult, useQuery } from '@tanstack/react-query';

import { FrequencySummary } from '#/components/classroom/FrequencyContent';
import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { StatisticsChart } from '#/components/StatisticsChart';
import { Card, CardContent } from '#/components/ui/card';
import {
    classroomFrequencyQueryOptions,
    classroomStatisticsQueryOptions
} from '#/queries/classrooms';

export function ClassroomStatistics({ id }: { id: string }) {
    const statistics = useQuery(classroomStatisticsQueryOptions(id));
    const frequency = useQuery(classroomFrequencyQueryOptions(id));

    return (
        <div className="flex flex-col gap-4">
            <StatisticsSection
                title="Resultados da turma"
                subject="as estatísticas"
                query={statistics}
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
                                <p className="text-center text-sm text-muted-foreground">
                                    Resultados desta turma indisponíveis
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </StatisticsSection>
            <StatisticsSection title="Sua frequência" subject="a frequência" query={frequency}>
                {(data) => <FrequencySummary data={data} />}
            </StatisticsSection>
        </div>
    );
}

function StatisticsSection<T>({
    title,
    subject,
    query,
    children
}: {
    title: string;
    subject: string;
    query: UseQueryResult<T, unknown>;
    children: (data: T) => React.ReactNode;
}) {
    return (
        <section>
            <h3 className="mb-2 px-1 text-sm font-semibold">{title}</h3>
            {query.isPending ? (
                <Card size="sm">
                    <CardContent>
                        <LoadingText>Carregando {subject}…</LoadingText>
                    </CardContent>
                </Card>
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
