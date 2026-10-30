import type { TurmaProps } from '#/components/search/TurmaCard';

import { RequirementList } from '#/components/search/RequirementList';
import { OCCUPANCY_COLOR } from '#/components/search/Seats';
import { SubjectDisclosure } from '#/components/search/SubjectDisclosure';
import { SubjectSearchLink } from '#/components/search/SubjectSearchLink';
import { SubjectStatistics } from '#/components/search/SubjectStatistics';
import { unitLabel } from '#/lib/profile';
import { describeSchedule } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';
import { seats } from '#/queries/subjects';

export function TurmaDetails({ subject, classroom }: TurmaProps) {
    const equivalences = subject.offered_equivalences ?? subject.equivalences;
    const status = seats(classroom);

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
                    {subject.unit ? unitLabel(subject.unit) : 'Unidade não informada'}
                </Detail>
                <Detail label="Docentes" className="col-span-2">
                    {classroom.professors.length > 0
                        ? classroom.professors.map(({ name }, index) => (
                              <span key={name}>
                                  {index > 0 && ', '}
                                  <SubjectSearchLink query={name}>{name}</SubjectSearchLink>
                              </span>
                          ))
                        : 'Docentes não informados'}
                </Detail>
                <Detail label="Carga horária">
                    {subject.hours == null ? 'Não informada' : `${subject.hours} horas`}
                </Detail>
                {subject.prerequisites?.length ? (
                    <Detail label="Pré-requisitos" className="col-span-2">
                        <RequirementList
                            requirements={subject.curriculum_prerequisites ?? subject.prerequisites}
                        />
                    </Detail>
                ) : null}
                {subject.corequisites?.length ? (
                    <Detail label="Correquisitos" className="col-span-2">
                        <p className="mb-2 text-xs text-muted-foreground">
                            Podem ser cursados junto com esta matéria, conforme a regra acadêmica.
                        </p>
                        <RequirementList
                            requirements={subject.curriculum_corequisites ?? subject.corequisites}
                        />
                    </Detail>
                ) : null}
                {equivalences?.length ? (
                    <Detail label="Equivalências" className="col-span-2">
                        <RequirementList requirements={equivalences} />
                    </Detail>
                ) : null}
                {subject.unlocks?.length ? (
                    <Detail label="Desbloqueia" className="col-span-2">
                        <SubjectDisclosure count={subject.unlocks.length}>
                            <ul className="flex min-w-0 flex-col gap-1">
                                {subject.unlocks.map((item) => (
                                    <li key={item.code} className="min-w-0 wrap-anywhere">
                                        <SubjectSearchLink query={item.code}>
                                            {item.name}
                                        </SubjectSearchLink>
                                    </li>
                                ))}
                            </ul>
                        </SubjectDisclosure>
                    </Detail>
                ) : null}
                <Detail label="Vagas">
                    <span
                        className={cn('tabular-nums', status && OCCUPANCY_COLOR[status.occupancy])}
                    >
                        {status ? `${status.occupied}/${status.vacancies}` : 'Não informadas'}
                    </span>
                </Detail>
            </dl>
            <SubjectStatistics
                key={`${subject.code}/${classroom.semester}/${classroom.number}`}
                code={subject.code}
                classroom={classroom}
            />
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
