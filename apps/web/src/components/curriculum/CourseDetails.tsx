import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { CourseInfoProps } from '#/components/curriculum/CourseInfo';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { normalizeCurriculum } from '#/lib/curriculum/model';
import { titleCase, unitLabel } from '#/lib/profile';
import { cn } from '#/lib/shadcn';
import { coursesQueryOptions } from '#/queries/courses';
import { curriculumQueryOptions } from '#/queries/curriculum';

export function CourseDetails({ course, entrySemester }: CourseInfoProps) {
    const catalog = useQuery(coursesQueryOptions);
    const matrix = useQuery({
        ...curriculumQueryOptions(course.id, entrySemester ?? ''),
        enabled: Boolean(entrySemester)
    });
    const details = catalog.data?.find((item) => item.id === course.id);
    const shift =
        details?.shift ??
        course.shift ??
        (matrix.data?.shift === 'D' ? 'Diurno' : matrix.data?.shift === 'N' ? 'Noturno' : null);
    const description = matrix.data?.matrix.split(/\s+-\s+/).slice(1) ?? [];
    const degree = description.find((part) =>
        /^(bacharelado|licenciatura|tecnólogo|tecnológico)$/i.test(part.trim())
    );
    const modality = description.find((part) =>
        /^(presencial|a dist[aâ]ncia|ead|semipresencial|h[ií]brido)$/i.test(part.trim())
    );
    const flow = useMemo(
        () => (matrix.data ? normalizeCurriculum(matrix.data) : null),
        [matrix.data]
    );
    return (
        <div className="flex flex-col gap-4">
            {(catalog.isPending || (entrySemester && matrix.isPending)) && (
                <LoadingText>Carregando informações do curso...</LoadingText>
            )}
            {catalog.isError && (
                <ErrorCard
                    message={
                        catalog.data
                            ? 'Não foi possível atualizar os dados do curso. Exibindo os dados salvos.'
                            : 'Não foi possível carregar os dados do curso.'
                    }
                    onRetry={() => catalog.refetch()}
                />
            )}
            {entrySemester && matrix.isError && (
                <ErrorCard
                    message={
                        matrix.data
                            ? 'Não foi possível atualizar a matriz curricular. Exibindo os dados salvos.'
                            : 'Não foi possível carregar a matriz curricular.'
                    }
                    onRetry={() => matrix.refetch()}
                />
            )}
            <dl className="grid grid-cols-2 gap-6 rounded-xl bg-muted/40 p-4">
                <Detail label="Unidade" className="col-span-2">
                    {details?.unit ? unitLabel(details.unit) : 'Não informada'}
                </Detail>
                <Detail label="Turno">{shift ? titleCase(shift) : 'Não informado'}</Detail>
                {matrix.data && (
                    <>
                        <Detail label="Modalidade">
                            {modality ? titleCase(modality.trim()) : 'Não informada'}
                        </Detail>
                        <Detail label="Grau acadêmico">
                            {degree ? titleCase(degree.trim()) : 'Não informado'}
                        </Detail>
                    </>
                )}
                <Detail label="Semestre de referência">{entrySemester || 'Não informado'}</Detail>
                {matrix.data && (
                    <>
                        <Detail label="Código da matriz">{matrix.data.code}</Detail>
                        <Detail label="Vigência desde">{matrix.data.valid_from}</Detail>
                        <Detail label="Semestres na matriz">{flow?.periods.length}</Detail>
                        <Detail label="Contagem de matérias">{flow?.subjects.length}</Detail>
                    </>
                )}
            </dl>
        </div>
    );
}

function Detail({
    label,
    children,
    className
}: {
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('min-w-0', className)}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 min-w-0 text-sm font-medium wrap-anywhere">{children}</dd>
        </div>
    );
}
