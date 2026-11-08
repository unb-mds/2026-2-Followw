import type { Lesson, LessonMarkStatus } from '@followw/core/queries/classrooms.ts';

import { CircleCheck, CircleDashed, CircleSlash, CircleX } from 'lucide-react';

export type MarkLessons = (lessons: Lesson[], status: LessonMarkStatus | null) => void;

export const LESSON_VIEW = {
    presente: { icon: CircleCheck, color: 'text-primary', name: 'Presença' },
    falta: { icon: CircleX, color: 'text-destructive', name: 'Falta' },
    nao_registrada: { icon: CircleDashed, color: 'text-muted-foreground', name: 'Não registrada' },
    cancelada: { icon: CircleSlash, color: 'text-muted-foreground', name: 'Aula cancelada' }
} as const;

export const selectable = (lesson: Lesson) => !lesson.marked && lesson.status === 'nao_registrada';

/** Aulas que o aluno pode marcar: sem chamada ou já marcadas por ele. */
export const markable = (lesson: Lesson) => selectable(lesson) || lesson.marked;

/** Situações das aulas de cada dia, em ordem cronológica. */
export function lessonsByDay(lessons: Lesson[]) {
    const days = new Map<string, Lesson[]>();
    for (const lesson of lessons.toReversed()) {
        const key = lesson.occurred_on.slice(0, 10);
        days.set(key, [...(days.get(key) ?? []), lesson]);
    }
    return days;
}
