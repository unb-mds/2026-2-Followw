import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DesktopDiagram, MobileDiagram } from '#/components/curriculum/Diagram';
import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { academicContext, initialMobilePeriod, normalizeCurriculum } from '#/lib/curriculum/model';
import { allClassroomsQueryOptions } from '#/queries/classrooms';
import { curriculumQueryOptions } from '#/queries/curriculum';
import { ApiError } from '#/queries/errors';

export function CurriculumView({
    courseId,
    entrySemester,
    currentPeriod,
    selected,
    studentContext = true,
    desktop
}: {
    courseId: number;
    entrySemester: string;
    currentPeriod: number | null;
    selected?: string;
    studentContext?: boolean;
    desktop: boolean | null;
}) {
    const matrix = useQuery(curriculumQueryOptions(courseId, entrySemester));
    const history = useQuery({ ...allClassroomsQueryOptions, enabled: studentContext });
    const context = useMemo(
        () => (studentContext ? academicContext(history.data, currentPeriod) : null),
        [history.data, currentPeriod, studentContext]
    );
    const model = useMemo(
        () => (matrix.data ? normalizeCurriculum(matrix.data) : null),
        [matrix.data]
    );
    const initialPeriod = model
        ? initialMobilePeriod(model.periods, studentContext, currentPeriod)
        : null;
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex max-h-64 shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-3 text-sm empty:hidden lg:px-6">
                {matrix.isPending && <LoadingText>Carregando matriz...</LoadingText>}
                {matrix.isLoadingError && (
                    <ErrorCard
                        message={
                            matrix.error instanceof ApiError && matrix.error.isNotFound
                                ? 'Nenhuma matriz disponível para este curso e semestre de ingresso.'
                                : 'Não foi possível carregar a matriz curricular.'
                        }
                        onRetry={() => matrix.refetch()}
                    />
                )}
                {matrix.isError && matrix.data && (
                    <ErrorCard
                        message="Não foi possível atualizar a matriz. Exibindo os dados salvos."
                        onRetry={() => matrix.refetch()}
                    />
                )}
                {model && studentContext && history.isPending && (
                    <LoadingText>
                        Carregando histórico; estados acadêmicos ainda indisponíveis...
                    </LoadingText>
                )}
                {model && studentContext && history.isLoadingError && (
                    <ErrorCard
                        message="Histórico indisponível. Os estados acadêmicos não puderam ser determinados."
                        onRetry={() => history.refetch()}
                    />
                )}
                {model && studentContext && history.isError && history.data && (
                    <ErrorCard
                        message="Não foi possível atualizar o histórico. Exibindo os estados salvos."
                        onRetry={() => history.refetch()}
                    />
                )}
                {model && studentContext && currentPeriod === null && (
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
                    <DesktopDiagram
                        model={model}
                        selected={selected}
                        state={context?.state ?? (() => null)}
                    />
                ) : (
                    <MobileDiagram
                        key={`${courseId}:${entrySemester}:${selected}:${initialPeriod}`}
                        model={model}
                        selected={selected}
                        state={context?.state ?? (() => null)}
                        initialPeriod={initialPeriod}
                    />
                ))}
        </div>
    );
}
