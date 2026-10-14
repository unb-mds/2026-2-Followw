import { Lock } from 'lucide-react';

import type { TurmaProps } from '#/components/search/TurmaCard';

import { Progress } from '#/components/ui/progress';
import { describeSchedule } from '#/lib/schedule';
import { availableSeats, formatRequirements, lockedReasons } from '#/queries/subjects';

export function TurmaDetails({ subject, classroom, prerequisitesMet }: TurmaProps) {
    const seats = availableSeats(classroom);
    const reasons = lockedReasons(classroom, prerequisitesMet);
    const { vacancies, occupied } = classroom;

    return (
        <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/40 p-4">
                <Detail label="Horário" className="col-span-2">
                    <span className="text-primary tabular-nums">
                        {describeSchedule(classroom.schedule) ?? 'Horário a definir'}
                    </span>
                </Detail>
                <Detail label="Local">{classroom.room ?? 'Local não informado'}</Detail>
                <Detail label="Unidade">{subject.unity ?? 'Unidade não informada'}</Detail>
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
                        {formatRequirements(subject.prerequisites)}
                    </Detail>
                ) : null}
                {subject.corequisites?.length ? (
                    <Detail label="Correquisitos" className="col-span-2">
                        {formatRequirements(subject.corequisites)}
                    </Detail>
                ) : null}
                <Detail label="Vagas" className="col-span-2">
                    {vacancies == null || occupied == null ? (
                        'Vagas não informadas'
                    ) : (
                        <div className="flex flex-col gap-2">
                            <p className="tabular-nums">{`${occupied} de ${vacancies} vagas ocupadas`}</p>
                            <Progress
                                className="**:data-[slot=progress-track]:h-2"
                                value={
                                    vacancies > 0 ? Math.min(100, (occupied / vacancies) * 100) : 0
                                }
                                aria-label="Ocupação da turma"
                                aria-valuetext={`${occupied} de ${vacancies} vagas ocupadas`}
                            />
                            <p className="text-xs text-muted-foreground">
                                {`${seats} ${seats === 1 ? 'vaga disponível' : 'vagas disponíveis'}`}
                            </p>
                        </div>
                    )}
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
        <div className={className}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm font-medium wrap-break-word">{children}</dd>
        </div>
    );
}
