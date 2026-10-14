import { Lock } from 'lucide-react';

import type { TurmaBusca } from '#/queries/search-classrooms';

import { Progress } from '#/components/ui/progress';
import { describeSchedule } from '#/lib/schedule';
import { availableSeats, lockedReasons } from '#/queries/search-classrooms';

export function TurmaDetails({
    turma,
    prerequisitesMet = turma.prerequisites_met ?? null
}: {
    turma: TurmaBusca;
    prerequisitesMet?: boolean | null;
}) {
    const seats = availableSeats(turma);
    const reasons = lockedReasons(turma, prerequisitesMet);
    const locked = reasons.length > 0;

    return (
        <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/40 p-4">
                <Detail label="Horário" className="col-span-2">
                    <span className="text-primary tabular-nums">
                        {describeSchedule(turma.schedule) ?? 'Horário a definir'}
                    </span>
                </Detail>
                <Detail label="Local">{turma.room ?? 'Local não informado'}</Detail>
                <Detail label="Unidade">{turma.subject.unity ?? 'Unidade não informada'}</Detail>
                <Detail label="Docentes" className="col-span-2">
                    {turma.professors.length > 0
                        ? turma.professors.join(', ')
                        : 'Docentes não informados'}
                </Detail>
                <Detail label="Carga horária">
                    {turma.subject.hours == null ? 'Não informada' : `${turma.subject.hours} horas`}
                </Detail>
                <Detail label="Vagas" className="col-span-2">
                    {seats == null ? (
                        'Vagas não informadas'
                    ) : (
                        <div className="flex flex-col gap-2">
                            <p className="tabular-nums">
                                {`${turma.occupied} de ${turma.vacancies} vagas ocupadas`}
                            </p>
                            <Progress
                                className="[&_[data-slot=progress-track]]:h-2"
                                value={
                                    turma.vacancies && turma.vacancies > 0
                                        ? Math.min(
                                              100,
                                              Math.max(
                                                  0,
                                                  ((turma.occupied ?? 0) / turma.vacancies) * 100
                                              )
                                          )
                                        : 0
                                }
                                aria-label="Ocupação da turma"
                                aria-valuetext={`${turma.occupied} de ${turma.vacancies} vagas ocupadas`}
                            />
                            <p className="text-xs text-muted-foreground">
                                {`${seats} ${seats === 1 ? 'vaga disponível' : 'vagas disponíveis'}`}
                            </p>
                        </div>
                    )}
                </Detail>
            </dl>
            {locked && (
                <section className="flex flex-col gap-2 rounded-xl border p-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <Lock className="size-4 shrink-0" aria-hidden="true" />
                        Turma indisponível
                    </h3>
                    <p className="text-sm text-muted-foreground">{reasons.join(' · ')}</p>
                    {turma.prerequisites && prerequisitesMet === false && (
                        <p className="text-xs leading-relaxed break-words text-muted-foreground">
                            Pré-requisitos: {turma.prerequisites}
                        </p>
                    )}
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
            <dd className="mt-1 text-sm font-medium break-words">{children}</dd>
        </div>
    );
}
