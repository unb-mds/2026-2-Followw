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
import { Download } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { CurriculumImageExport } from '@/components/curriculum/CurriculumImage';
import { Diagram } from '@/components/curriculum/Diagram';
import { QueryState } from '@/components/QueryState';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { usePullToRefresh } from '@/lib/pull-to-refresh';

export function CurriculumView({
    courseId,
    courseName,
    entrySemester,
    completedSubjects,
    currentPeriod,
    selected,
    ownCourse,
    loggedIn,
    header
}: {
    courseId: number;
    courseName: string;
    entrySemester: string;
    completedSubjects?: string[];
    currentPeriod: number | null;
    selected?: string;
    ownCourse: boolean;
    loggedIn: boolean;
    header: React.ReactNode;
}) {
    const options = curriculumQueryOptions(courseId, entrySemester);
    const matrix = useQuery(options);
    const history = useQuery({ ...allClassroomsQueryOptions, enabled: loggedIn });
    const [downloading, setDownloading] = useState(false);
    const [downloadError, setDownloadError] = useState(false);
    const state = useMemo(
        () =>
            loggedIn ? academicState(history.data, currentPeriod, completedSubjects) : undefined,
        [history.data, currentPeriod, completedSubjects, loggedIn]
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
            {model && model.subjects.length > 0 && (
                <View className="flex-row flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={downloading}
                        onPress={() => {
                            setDownloadError(false);
                            setDownloading(true);
                        }}
                    >
                        <Icon as={Download} className="size-4" />
                        <Text>{downloading ? 'Preparando arquivo…' : 'Baixar fluxograma'}</Text>
                    </Button>
                    {downloadError && (
                        <Text role="alert" className="text-sm text-destructive">
                            Não foi possível baixar o fluxograma. Tente novamente.
                        </Text>
                    )}
                </View>
            )}
            {downloading && model && matrix.data && (
                <CurriculumImageExport
                    model={model}
                    name={courseName}
                    matrix={`Matriz ${matrix.data.code} · ${matrix.data.valid_from}`}
                    state={state}
                    onDone={(failed) => {
                        setDownloading(false);
                        setDownloadError(failed);
                    }}
                />
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
