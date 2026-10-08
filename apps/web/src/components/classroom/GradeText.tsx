import type { Classroom } from '#/queries/classrooms';

import { cn } from '#/lib/shadcn';

const GRADE_COLORS = {
    SS: 'text-info',
    MS: 'text-primary',
    MM: 'text-warning',
    MI: 'text-destructive',
    II: 'text-destructive',
    SR: 'text-destructive'
} as const;

export function GradeText({ grade }: { grade: NonNullable<Classroom['grade']> }) {
    return <span className={cn('shrink-0 font-medium', GRADE_COLORS[grade])}>{grade}</span>;
}
