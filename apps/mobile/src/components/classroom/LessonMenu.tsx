import type { Lesson, LessonMarkStatus } from '@followw/core/queries/classrooms.ts';

import { CircleCheck, CircleDashed, CircleSlash, CircleX } from 'lucide-react-native';

import {
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type MarkLessons = (lessons: Lesson[], status: LessonMarkStatus | null) => void;

export const LESSON_VIEW = {
    presente: { icon: CircleCheck, color: 'text-primary', name: 'Presença' },
    falta: { icon: CircleX, color: 'text-destructive', name: 'Falta' },
    nao_registrada: { icon: CircleDashed, color: 'text-muted-foreground', name: 'Não registrada' },
    cancelada: { icon: CircleSlash, color: 'text-muted-foreground', name: 'Aula cancelada' }
} as const;

// Marcações que o aluno pode dar a uma aula sem chamada no SIGAA.
const MARKS: LessonMarkStatus[] = ['presente', 'falta', 'cancelada'];

export const selectable = (lesson: Lesson) => !lesson.marked && lesson.status === 'nao_registrada';

/** Aulas que o aluno pode marcar: sem chamada ou já marcadas por ele. */
export const markable = (lesson: Lesson) => selectable(lesson) || lesson.marked;

export function LessonMenuContent({ lessons, onMark }: { lessons: Lesson[]; onMark: MarkLessons }) {
    const marked = lessons.filter((lesson) => lesson.marked);
    return (
        <DropdownMenuContent className="w-44">
            {MARKS.map((mark) => {
                const option = LESSON_VIEW[mark];
                return (
                    <DropdownMenuItem
                        key={mark}
                        disabled={lessons.every(
                            (lesson) => lesson.marked && lesson.status === mark
                        )}
                        onPress={() => onMark(lessons, mark)}
                    >
                        <Icon as={option.icon} className={cn('size-4', option.color)} />
                        <Text>{option.name}</Text>
                    </DropdownMenuItem>
                );
            })}
            {marked.length > 0 && (
                <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onPress={() => onMark(marked, null)}>
                        <Icon as={CircleDashed} className="size-4 text-popover-foreground" />
                        <Text>Remover marcação</Text>
                    </DropdownMenuItem>
                </>
            )}
        </DropdownMenuContent>
    );
}
