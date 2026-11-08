import type { SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { subjectStatisticsQueryOptions } from '@followw/core/queries/subject-statistics.ts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { StatisticsChart } from '@/components/StatisticsChart';
import { TabFilter } from '@/components/TabFilter';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

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
        <View className="gap-3 rounded-xl border border-border p-4">
            <Text className="text-sm font-semibold">Estatísticas anteriores</Text>
            {query.isPending && (
                <Text className="text-sm text-muted-foreground">Carregando estatísticas…</Text>
            )}
            {query.isError && (
                <View className="items-start gap-2">
                    <Text role="alert" className="text-sm text-muted-foreground">
                        Não foi possível carregar as estatísticas.
                    </Text>
                    <Button variant="outline" size="sm" onPress={() => void query.refetch()}>
                        <Text>Tentar novamente</Text>
                    </Button>
                </View>
            )}
            {data && !data.semesters.length && (
                <Text className="text-sm text-muted-foreground">
                    Não há estatísticas de semestres anteriores para esta matéria com os mesmos
                    docentes.
                </Text>
            )}
            {data && data.semesters.length > 0 && (
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
                    {period && (
                        <StatisticsChart
                            data={period.shares}
                            label={`Situação dos discentes · ${period.semester ?? 'Média geral'}`}
                        />
                    )}
                </>
            )}
        </View>
    );
}
