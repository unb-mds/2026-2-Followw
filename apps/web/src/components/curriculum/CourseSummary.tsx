import { useQuery } from '@tanstack/react-query';
import { Building2, Clock3, GraduationCap, Layers } from 'lucide-react';
import { useMemo } from 'react';

import type { PublicCourse } from '#/queries/courses';

import { normalizeCurriculum } from '#/lib/curriculum/model';
import { titleCase, unitLabel } from '#/lib/profile';
import { coursesQueryOptions } from '#/queries/courses';
import { curriculumQueryOptions, shiftLabels } from '#/queries/curriculum';

export interface CourseSummaryProps {
    course: Pick<PublicCourse, 'id' | 'name' | 'shift'>;
    entrySemester?: string | null;
}

/** Erros e carregamento ficam com a página; aqui só o que já estiver em cache. */
export function CourseSummary({ course, entrySemester }: CourseSummaryProps) {
    const catalog = useQuery(coursesQueryOptions);
    const matrix = useQuery({
        ...curriculumQueryOptions(course.id, entrySemester ?? ''),
        enabled: Boolean(entrySemester)
    });
    const unit = catalog.data?.find((item) => item.id === course.id)?.unit;
    const curriculum = matrix.data;
    const shift = course.shift ?? (curriculum?.shift && shiftLabels[curriculum.shift]);
    const flow = useMemo(() => (curriculum ? normalizeCurriculum(curriculum) : null), [curriculum]);
    const meta = curriculum && `Matriz ${curriculum.code} - ${curriculum.valid_from}`;

    return (
        <section aria-label="Informações do curso">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
                {unit?.code && <span className="font-semibold text-primary">{unit.code}</span>}
                {unit?.code && meta && ' · '}
                {meta}
            </p>
            <h2 className="mt-1 text-xl leading-tight font-semibold tracking-tight text-balance">
                {course.name}
            </h2>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground lg:flex-row lg:flex-wrap lg:gap-x-6">
                <SummaryItem icon={Clock3}>
                    <span className="font-medium text-primary">
                        {[shift ? titleCase(shift) : 'Turno não informado', curriculum?.modality]
                            .filter(Boolean)
                            .join(' · ')}
                    </span>
                </SummaryItem>
                {curriculum?.degree && (
                    <SummaryItem icon={GraduationCap}>{titleCase(curriculum.degree)}</SummaryItem>
                )}
                <SummaryItem icon={Building2}>
                    {unit ? unitLabel({ name: unit.name }) : 'Unidade não informada'}
                </SummaryItem>
                {curriculum && flow && (
                    <SummaryItem icon={Layers}>
                        {[
                            plural(flow.periods.length, 'semestre', 'semestres'),
                            plural(
                                flow.subjects.length,
                                'matéria obrigatória',
                                'matérias obrigatórias'
                            )
                        ].join(' · ')}
                    </SummaryItem>
                )}
            </ul>
        </section>
    );
}

function plural(count: number, one: string, many: string) {
    return `${count} ${count === 1 ? one : many}`;
}

function SummaryItem({
    icon: Icon,
    children
}: {
    icon: React.FC<{ className?: string }>;
    children: React.ReactNode;
}) {
    return (
        <li className="flex items-start gap-2">
            <Icon className="mt-1 size-3.5 shrink-0" />
            <span className="min-w-0">{children}</span>
        </li>
    );
}
