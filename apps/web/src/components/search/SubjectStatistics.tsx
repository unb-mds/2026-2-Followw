import type { SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { subjectStatisticsQueryOptions } from '@followw/core/queries/subject-statistics.ts';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';

import { LoadingText } from '#/components/LoadingText';
import { TabFilter } from '#/components/TabFilter';
import { Button } from '#/components/ui/button';

const StatisticsChart = lazy(() =>
    import('#/components/StatisticsChart').then((module) => ({ default: module.StatisticsChart }))
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

    return (
        <section
            className="flex flex-col gap-3 rounded-xl border p-4"
            aria-label="Estatísticas anteriores"
        >
            <h3 className="text-sm font-semibold">Estatísticas anteriores</h3>
            {query.isPending ? (
                <LoadingText className="justify-center">Carregando estatísticas...</LoadingText>
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
                    {period ? (
                        <Suspense fallback={<LoadingText>Carregando gráfico...</LoadingText>}>
                            <StatisticsChart
                                data={period.shares}
                                label={`Situação dos discentes · ${period.semester ?? 'Média geral'}`}
                            />
                        </Suspense>
                    ) : null}
                </>
            ) : null}
        </section>
    );
}
