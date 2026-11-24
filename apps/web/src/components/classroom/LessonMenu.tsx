import type { Lesson, LessonMarkStatus } from '@followw/core/queries/classrooms.ts';

import { CircleDashed } from 'lucide-react';

import { LESSON_VIEW, type MarkLessons } from '#/components/classroom/lesson-utils';
import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator
} from '#/components/ui/dropdown-menu';

// Marcações que o aluno pode dar a uma aula sem chamada no SIGAA.
const MARKS: LessonMarkStatus[] = ['presente', 'falta', 'cancelada'];

export function LessonMenuContent({
    lessons,
    onMark,
    anchor
}: {
    lessons: Lesson[];
    onMark: MarkLessons;
    anchor?: React.RefObject<Element | null>;
}) {
    const marked = lessons.filter((lesson) => lesson.marked);
    return (
        <DropdownMenuContent className="w-44" anchor={anchor}>
            {MARKS.map((mark) => {
                const option = LESSON_VIEW[mark];
                return (
                    <DropdownMenuItem
                        key={mark}
                        disabled={lessons.every(
                            (lesson) => lesson.marked && lesson.status === mark
                        )}
                        onClick={() => onMark(lessons, mark)}
                    >
                        <option.icon className={option.color} />
                        {option.name}
                    </DropdownMenuItem>
                );
            })}
            {marked.length > 0 && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onMark(marked, null)}>
                        <CircleDashed />
                        Remover marcação
                    </DropdownMenuItem>
                </>
            )}
        </DropdownMenuContent>
    );
}
