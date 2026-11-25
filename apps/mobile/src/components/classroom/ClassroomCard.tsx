import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { describeSchedule } from '@followw/core/lib/schedule.ts';
import { finalGrade } from '@followw/core/queries/classrooms.ts';

import { ClassCard } from '@/components/home/ClassCard';

export function ClassroomCard({
    classroom,
    onClick
}: {
    classroom: Classroom;
    onClick?: () => void;
}) {
    return (
        <ClassCard
            title={classroom.subject.name}
            time={describeSchedule(classroom.schedule) ?? 'Horário a definir'}
            location={classroom.current ? (classroom.room ?? null) : undefined}
            grade={finalGrade(classroom)}
            status={classroom.status === 'pending_enrollment' ? 'pending' : 'normal'}
            onClick={onClick}
        />
    );
}
