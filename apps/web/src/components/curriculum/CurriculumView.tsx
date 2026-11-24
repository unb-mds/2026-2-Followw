import type { CurriculumModel } from '@followw/core/lib/curriculum/types.ts';
import type { UseQueryResult } from '@tanstack/react-query';

import {
    academicState,
    initialMobilePeriod,
    normalizeCurriculum
} from '@followw/core/lib/curriculum/model.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { curriculumQueryOptions } from '@followw/core/queries/curriculum.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DesktopDiagram, MobileDiagram } from '#/components/curriculum/Diagram';
import { LoadingText } from '#/components/LoadingText';
import { QueryState } from '#/components/QueryState';
import { Button } from '#/components/ui/button';
import { saveFile } from '#/lib/download';

function CurriculumNotices({
    matrix,
    history,
    model,
    loggedIn,
    ownCourse,
    currentPeriod,
    selected
}: {
    matrix: UseQueryResult<unknown, unknown>;
    history: UseQueryResult<unknown, unknown>;
    model: CurriculumModel | null;
    loggedIn: boolean;
    ownCourse: boolean;
    currentPeriod: number | null;
    selected?: string;
}) {
    const matrixError =
        matrix.error instanceof ApiError && matrix.error.isNotFound
            ? 'Nenhuma matriz disponível para este curso e semestre de ingresso.'
            : 'Não foi possível carregar a matriz curricular.';

    return (
        <div className="flex max-h-64 shrink-0 flex-col gap-2 overflow-y-auto px-4 pb-3 text-sm empty:hidden lg:px-6">
            <QueryState
                query={matrix}
                loading="Carregando matriz..."
                error={matrixError}
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
    );
}

function CurriculumDiagram({
    courseId,
    entrySemester,
    model,
    selected,
    state,
    initialPeriod,
    desktop
}: {
    courseId: number;
    entrySemester: string;
    model: CurriculumModel;
    selected?: string;
    state?: ReturnType<typeof academicState>;
    initialPeriod: number;
    desktop: boolean | null;
}) {
    if (desktop === null) return <LoadingText className="p-4">Preparando fluxo...</LoadingText>;
    if (desktop) return <DesktopDiagram model={model} selected={selected} state={state} />;
    return (
        <MobileDiagram
            key={`${courseId}:${entrySemester}:${selected}:${initialPeriod}`}
            model={model}
            selected={selected}
            state={state}
            initialPeriod={initialPeriod}
        />
    );
}

export function CurriculumView({
    courseId,
    courseName,
    entrySemester,
    completedSubjects,
    currentPeriod,
    selected,
    ownCourse,
    loggedIn,
    desktop
}: {
    courseId: number;
    courseName: string;
    entrySemester: string;
    completedSubjects?: string[];
    currentPeriod: number | null;
    selected?: string;
    ownCourse: boolean;
    loggedIn: boolean;
    // nulo até medir a tela, para o SSR não escolher um diagrama
    desktop: boolean | null;
}) {
    const matrix = useQuery(curriculumQueryOptions(courseId, entrySemester));
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
    const ready = model && model.subjects.length > 0 && initialPeriod !== null;

    async function download() {
        if (!model || !matrix.data || downloading) return;
        setDownloading(true);
        setDownloadError(false);
        try {
            const { createCurriculumPng } = await import('#/lib/curriculum/export');
            const blob = await createCurriculumPng({
                model,
                name: courseName,
                matrix: `Matriz ${matrix.data.code} · ${matrix.data.valid_from}`,
                state
            });
            saveFile(blob, `fluxograma-${courseId}-${entrySemester}.png`);
        } catch {
            setDownloadError(true);
        } finally {
            setDownloading(false);
        }
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <CurriculumNotices
                matrix={matrix}
                history={history}
                model={model}
                loggedIn={loggedIn}
                ownCourse={ownCourse}
                currentPeriod={currentPeriod}
                selected={selected}
            />
            {model && model.subjects.length > 0 && (
                <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 lg:px-6">
                    <Button variant="outline" size="sm" disabled={downloading} onClick={download}>
                        <Download aria-hidden="true" />
                        {downloading ? 'Preparando arquivo…' : 'Baixar fluxograma'}
                    </Button>
                    {downloadError && (
                        <output className="text-sm text-destructive">
                            Não foi possível baixar o fluxograma. Tente novamente.
                        </output>
                    )}
                </div>
            )}
            {ready && (
                <CurriculumDiagram
                    courseId={courseId}
                    entrySemester={entrySemester}
                    model={model}
                    selected={selected}
                    state={state}
                    initialPeriod={initialPeriod}
                    desktop={desktop}
                />
            )}
        </div>
    );
}
