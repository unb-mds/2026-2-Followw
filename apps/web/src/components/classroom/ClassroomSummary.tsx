import { Award, Clock3, Hourglass, MapPin } from 'lucide-react';

import type { Classroom } from '#/queries/classrooms';

import { GradeText } from '#/components/classroom/GradeText';
import { describeSchedule } from '#/lib/schedule';
export function ClassroomSummary({ classroom }: { classroom: Classroom }) {
    const schedule = describeSchedule(classroom.schedule);
    return (
        <header>
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
                <span className="font-semibold text-primary">
                    {classroom.subject.code ?? 'Disciplina'}
                </span>
                {` · Turma ${classroom.number} · ${classroom.semester}`}
            </p>
            <h1 className="mt-1 text-xl leading-tight font-semibold tracking-tight text-balance">
                {classroom.subject.name}
            </h1>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground">
                <SummaryItem icon={Clock3}>
                    <span className="font-medium text-primary tabular-nums">
                        {schedule ?? 'Horário a definir'}
                    </span>
                </SummaryItem>
                {classroom.current ? (
                    <SummaryItem icon={MapPin}>
                        {classroom.room ?? 'Local não informado'}
                    </SummaryItem>
                ) : (
                    <SummaryItem icon={Award}>
                        {classroom.grade ? (
                            <GradeText grade={classroom.grade} />
                        ) : (
                            'Menção não disponível'
                        )}
                    </SummaryItem>
                )}
                {classroom.subject.hours != null && (
                    <SummaryItem icon={Hourglass}>{classroom.subject.hours}h</SummaryItem>
                )}
            </ul>
        </header>
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
