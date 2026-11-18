import type { CompletedSubjects } from '@followw/core/lib/curriculum/types.ts';

import {
    academicState,
    initialMobilePeriod,
    normalizeCurriculum
} from '@followw/core/lib/curriculum/model.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { curriculumQueryOptions } from '@followw/core/queries/curriculum.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CompletedCredits } from '#/components/curriculum/CompletedCredits';
import { DesktopDiagram, MobileDiagram } from '#/components/curriculum/Diagram';
import { LoadingText } from '#/components/LoadingText';
import { QueryState } from '#/components/QueryState';

export function CurriculumView({
    courseId,
    entrySemester,
    curriculumId,
    completedSubjects,
    currentPeriod,
    selected,
    ownCourse,
    loggedIn,
    desktop
}: {
    courseId: number;
    entrySemester?: string | null;
    curriculumId?: number | null;
    completedSubjects?: CompletedSubjects | null;
    currentPeriod: number | null;
    selected?: string;
    ownCourse: boolean;
    loggedIn: boolean;
    // nulo até medir a tela, para o SSR não escolher um diagrama
    desktop: boolean | null;
}) {
    const matrix = useQuery(curriculumQueryOptions(courseId, entrySemester, curriculumId));
    const history = useQuery({ ...allClassroomsQueryOptions, enabled: loggedIn });
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
                {model && loggedIn && (
                    <QueryState
                        query={history}
                        loading="Carregando turmas cursadas..."
                        error="Não foi possível carregar as turmas cursadas."
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
                {model && (
                    <CompletedCredits completedSubjects={completedSubjects} shown={model.byCode} />
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
                        key={`${courseId}:${matrix.data?.sigaa_id}:${selected}:${initialPeriod}`}
                        model={model}
                        selected={selected}
                        state={state}
                        initialPeriod={initialPeriod}
                    />
                ))}
        </div>
    );
}
