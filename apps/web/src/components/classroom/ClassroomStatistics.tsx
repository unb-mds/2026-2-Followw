import { useQuery } from '@tanstack/react-query';

import { ErrorCard, SIGAA_DOWN_MESSAGE, StaleDataNotice } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { StatisticsChart } from '#/components/StatisticsChart';
import { Card, CardContent } from '#/components/ui/card';
import { classroomStatisticsQueryOptions } from '#/queries/classrooms';

export function ClassroomStatistics({ id }: { id: string }) {
    const query = useQuery(classroomStatisticsQueryOptions(id));

    if (query.isLoadingError)
        return <ErrorCard message={SIGAA_DOWN_MESSAGE} onRetry={() => query.refetch()} />;

    return (
        <Card size="sm">
            <CardContent>
                {query.isPending ? (
                    <LoadingText>Carregando estatísticas…</LoadingText>
                ) : (
                    <>
                        {query.isError && (
                            <StaleDataNotice subject="as estatísticas" className="mb-2" />
                        )}

                        {query.data.some((share) => share.percentage > 0) ? (
                            <StatisticsChart
                                data={query.data}
                                label="Situação dos discentes desta turma"
                            />
                        ) : (
                            <p className="text-center text-sm text-muted-foreground">
                                Resultados desta turma indisponíveis
                            </p>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
