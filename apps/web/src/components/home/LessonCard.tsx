import type { WeekLesson } from '@followw/core/queries/lessons.ts';

import { ClassCard, type ClassCardProps } from '#/components/home/ClassCard';

interface LessonCardProps {
    lesson: WeekLesson;
    start: string;
    end: string;
    status: ClassCardProps['status'];
    onClick?: () => void;
}

export function LessonCard({ lesson, start, end, status, onClick }: LessonCardProps) {
    return (
        <ClassCard
            plain
            title={lesson.classroom.subject.name}
            time={`${start}–${end}`}
            location={lesson.classroom.room ?? null}
            status={lesson.status === 'cancelada' ? 'cancelled' : status}
            onClick={onClick}
        />
    );
}
