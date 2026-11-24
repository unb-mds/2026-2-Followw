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

export type LessonRunStatus = 'presente' | 'falta' | 'nao_registrada';

export type LessonRun = { id: string; status: LessonRunStatus; count: number };

/** Aulas em ordem cronológica, agrupadas em sequências de mesma situação. */
export function lessonRuns(lessons: Lesson[]): LessonRun[] {
    const runs: LessonRun[] = [];
    for (const lesson of lessons.toReversed()) {
        if (lesson.status === 'cancelada') continue;
        const last = runs.at(-1);
        if (last?.status === lesson.status) last.count++;
        else runs.push({ id: lesson.id, status: lesson.status, count: 1 });
    }
    return runs;
}

/** Situações das aulas de cada dia, em ordem cronológica. */
export function lessonsByDay(lessons: Lesson[]) {
    const days = new Map<string, Lesson[]>();
    for (const lesson of lessons.toReversed()) {
        const key = lesson.occurred_on.slice(0, 10);
        days.set(key, [...(days.get(key) ?? []), lesson]);
    }
    return days;
}
