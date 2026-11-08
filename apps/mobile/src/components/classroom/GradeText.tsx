import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const GRADE_COLORS = {
    SS: 'text-info',
    MS: 'text-primary',
    MM: 'text-warning',
    MI: 'text-destructive',
    II: 'text-destructive',
    SR: 'text-destructive'
} as const;

export function GradeText({
    grade,
    className
}: {
    grade: NonNullable<Classroom['grade']>;
    className?: string;
}) {
    return <Text className={cn('font-medium', GRADE_COLORS[grade], className)}>{grade}</Text>;
}
