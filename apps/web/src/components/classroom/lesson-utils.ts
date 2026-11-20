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
