import type { PublicCourse } from '@followw/core/queries/courses.ts';

import { normalizeCurriculum } from '@followw/core/lib/curriculum/model.ts';
import { estimatedProgress } from '@followw/core/lib/curriculum/progress.ts';
import { plural } from '@followw/core/lib/plural.ts';
import { titleCase, unitLabel } from '@followw/core/lib/profile.ts';
import { allClassroomsQueryOptions } from '@followw/core/queries/classrooms.ts';
import { courseQueryOptions } from '@followw/core/queries/courses.ts';
import { curriculumQueryOptions, shiftLabels } from '@followw/core/queries/curriculum.ts';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChartPie, Clock3, GraduationCap, Layers } from 'lucide-react';
import { useMemo } from 'react';

import type { UserProfile } from '#/queries/me';

export interface CourseSummaryProps {
    course: Pick<PublicCourse, 'id' | 'name' | 'shift'>;
    entrySemester?: string | null;
    student?: Pick<UserProfile, 'completed_subjects' | 'completed_subject_hours'>;
}

/** Erros e carregamento ficam com a página; aqui só o que já estiver em cache. */
export function CourseSummary({ course, entrySemester, student }: CourseSummaryProps) {
    const listed = useQuery(courseQueryOptions(course.id));
    const matrix = useQuery(curriculumQueryOptions(course.id, entrySemester));
    const unit = listed.data?.unit;
    const curriculum = matrix.data;
    const history = useQuery({
        ...allClassroomsQueryOptions,
        enabled: Boolean(student && curriculum)
    });
    const progress = useMemo(
        () =>
            student && curriculum && history.data
                ? estimatedProgress(
                      curriculum,
                      history.data,
                      student.completed_subjects,
                      student.completed_subject_hours
                  )
                : null,
        [student, curriculum, history.data]
    );
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
                {student && curriculum && history.data && (
                    <SummaryItem icon={ChartPie}>
                        {progress
                            ? `Integralização estimada: ${progress.completed} de ${progress.total} h (${progress.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`
                            : 'Carga horária da matriz indisponível para estimar a integralização.'}
                    </SummaryItem>
                )}
            </ul>
        </section>
    );
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
