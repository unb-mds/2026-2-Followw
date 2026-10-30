import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DesktopDiagram, MobileDiagram } from '#/components/curriculum/Diagram';
import { LoadingText } from '#/components/LoadingText';
import { QueryState } from '#/components/QueryState';
import { academicState, initialMobilePeriod, normalizeCurriculum } from '#/lib/curriculum/model';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { curriculumQueryOptions } from '#/queries/curriculum';
import { ApiError } from '#/queries/errors';

export function CurriculumView({
    courseId,
    entrySemester,
    currentPeriod,
    selected,
    ownCourse,
    desktop
}: {
    courseId: number;
    entrySemester: string;
    currentPeriod: number | null;
    selected?: string;
    ownCourse: boolean;
    // nulo até medir a tela, para o SSR não escolher um diagrama
    desktop: boolean | null;
}) {
    const matrix = useQuery(curriculumQueryOptions(courseId, entrySemester));
    const history = useQuery({ ...allClassroomsQueryOptions, enabled: ownCourse });
    const state = useMemo(
        () => (ownCourse ? academicState(history.data, currentPeriod) : undefined),
        [history.data, currentPeriod, ownCourse]
    );
    const model = useMemo(
        () => (matrix.data ? normalizeCurriculum(matrix.data) : null),
        [matrix.data]
    );
    const initialPeriod = model
        ? initialMobilePeriod(model.periods, ownCourse, currentPeriod)
        : null;
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex max-h-64 shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-3 text-sm empty:hidden lg:px-6">
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
                {model && ownCourse && (
                    <QueryState
                        query={history}
                        loading="Carregando histórico; estados acadêmicos ainda indisponíveis..."
                        error="Histórico indisponível. Os estados acadêmicos não puderam ser determinados."
                        stale="Não foi possível atualizar o histórico. Exibindo os estados salvos."
                    />
                )}
                {model && ownCourse && currentPeriod === null && (
                    <output>Período atual indisponível; atrasos não foram calculados.</output>
                )}
                {model && selected && !model.byCode.has(selected) && (
                    <output>
                        A matéria {selected} não pertence aos períodos exibidos desta matriz.
                    </output>
                )}
                {model && model.subjects.length === 0 && (
                    <p>Nenhuma disciplina nos períodos regulares desta matriz.</p>
                )}
            </div>
            {model &&
                model.subjects.length > 0 &&
                initialPeriod !== null &&
                (desktop === null ? (
                    <LoadingText className="p-4">Preparando fluxo...</LoadingText>
                ) : desktop ? (
                    <DesktopDiagram model={model} selected={selected} state={state} />
                ) : (
                    <MobileDiagram
                        key={`${courseId}:${entrySemester}:${selected}:${initialPeriod}`}
                        model={model}
                        selected={selected}
                        state={state}
                        initialPeriod={initialPeriod}
                    />
                ))}
        </div>
    );
}
