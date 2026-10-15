import { cn } from 'cn';
import { Lock } from 'lucide-react';

import type { TurmaProps } from '#/components/search/TurmaCard';

import { RequirementList } from '#/components/search/RequirementList';
import { titleCase } from '#/lib/profile';
import { describeSchedule } from '#/lib/schedule';
import { lockedReasons } from '#/queries/subjects';

export function TurmaDetails({ subject, classroom, prerequisitesMet }: TurmaProps) {
    const reasons = lockedReasons(classroom, prerequisitesMet);
    const { vacancies, occupied } = classroom;
    const remaining = vacancies == null || occupied == null ? null : vacancies - occupied;

    return (
        <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/40 p-4">
                <Detail label="Horário" className="col-span-2">
                    <span className="text-primary tabular-nums">
                        {describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                    </span>
                </Detail>
                <Detail label="Local">{classroom.room ?? 'Local não informado'}</Detail>
                <Detail label="Unidade">
                    {subject.unity_name
                        ? titleCase(subject.unity_name)
                        : (subject.unity ?? 'Unidade não informada')}
                </Detail>
                <Detail label="Docentes" className="col-span-2">
                    {classroom.professors.length > 0
                        ? classroom.professors.join(', ')
                        : 'Docentes não informados'}
                </Detail>
                <Detail label="Carga horária">
                    {subject.hours == null ? 'Não informada' : `${subject.hours} horas`}
                </Detail>
                {subject.prerequisites?.length ? (
                    <Detail label="Pré-requisitos" className="col-span-2">
                        <RequirementList requirements={subject.prerequisites} />
                    </Detail>
                ) : null}
                {subject.corequisites?.length ? (
                    <Detail label="Correquisitos" className="col-span-2">
                        <RequirementList requirements={subject.corequisites} />
                    </Detail>
                ) : null}
                {subject.equivalences?.length ? (
                    <Detail label="Equivalências" className="col-span-2">
                        <RequirementList requirements={subject.equivalences} />
                    </Detail>
                ) : null}
                <Detail label="Vagas">
                    <span
                        className={cn(
                            'tabular-nums',
                            remaining != null && remaining <= 0 && 'text-destructive',
                            remaining != null && remaining > 0 && remaining <= 3 && 'text-warning'
                        )}
                    >
                        {vacancies == null || occupied == null
                            ? 'Não informadas'
                            : `${occupied}/${vacancies}`}
                    </span>
                </Detail>
            </dl>
            {reasons.length > 0 && (
                <section className="flex flex-col gap-2 rounded-xl border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Lock className="size-4 shrink-0" aria-hidden="true" />
                        Turma indisponível
                    </h3>
                    <p className="text-sm text-muted-foreground">{reasons.join(' · ')}</p>
                </section>
            )}
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
