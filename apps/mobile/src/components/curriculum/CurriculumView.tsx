import {
    academicState,
    initialMobilePeriod,
    normalizeCurriculum
} from '@followw/core/lib/curriculum/model.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { curriculumQueryOptions } from '@followw/core/queries/curriculum.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { View } from 'react-native';

import { Diagram } from '@/components/curriculum/Diagram';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

export function CurriculumView({
    courseId,
    entrySemester,
    currentPeriod,
    selected,
    ownCourse,
    loggedIn,
    header
}: {
    courseId: number;
    entrySemester: string;
    currentPeriod: number | null;
    selected?: string;
    ownCourse: boolean;
    loggedIn: boolean;
    header: React.ReactNode;
}) {
    const options = curriculumQueryOptions(courseId, entrySemester);
    const matrix = useQuery(options);
    const history = useQuery({ ...allClassroomsQueryOptions, enabled: loggedIn });
    const state = useMemo(
        () => (loggedIn ? academicState(history.data, currentPeriod) : undefined),
        [history.data, currentPeriod, loggedIn]
    );
    const model = useMemo(
        () => (matrix.data ? normalizeCurriculum(matrix.data) : null),
        [matrix.data]
    );
    const initialPeriod = model
        ? initialMobilePeriod(model.periods, ownCourse, currentPeriod)
        : null;
    const refreshControl = usePullToRefresh((queryClient) => refreshQuery(queryClient, options));

    const notices = (
        <>
            <QueryState
                query={matrix}
                loading="Carregando matriz..."
                error={
                    matrix.error instanceof ApiError && matrix.error.isNotFound
                        ? 'Nenhuma matriz disponível para este curso e semestre de ingresso.'
                        : 'Não foi possível carregar a matriz curricular.'
                }
                stale="Não foi possível atualizar a matriz. Exibindo os dados salvos."
            />
            {model && loggedIn && (
                <QueryState
                    query={history}
                    loading="Carregando histórico; estados acadêmicos ainda indisponíveis..."
                    error="Histórico indisponível. Os estados acadêmicos não puderam ser determinados."
                    stale="Não foi possível atualizar o histórico. Exibindo os estados salvos."
                />
            )}
            {model && ownCourse && currentPeriod === null && (
                <Text className="text-sm">
                    Período atual indisponível; atrasos não foram calculados.
                </Text>
            )}
            {model && selected && !model.byCode.has(selected) && (
                <Text className="text-sm">
                    A matéria {selected} não pertence aos períodos exibidos desta matriz.
                </Text>
            )}
            {model && model.subjects.length === 0 && (
                <Text className="text-sm">
                    Nenhuma disciplina nos períodos regulares desta matriz.
                </Text>
            )}
        </>
    );

    if (!model || model.subjects.length === 0 || initialPeriod === null)
        return (
            <Screen
                fullscreen
                header={header}
                onRefreshData={(queryClient) => refreshQuery(queryClient, options)}
            >
                <View className="gap-2">{notices}</View>
            </Screen>
        );
    return (
        <Diagram
            // semestre inicial vale por matriz/seleção
            key={`${courseId}:${entrySemester}:${selected}:${initialPeriod}`}
            model={model}
            selected={selected}
            state={state}
            initialPeriod={initialPeriod}
            refreshControl={refreshControl}
            header={header}
            notices={notices}
        />
    );
}
