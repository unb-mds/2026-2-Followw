import type { Occupancy, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { seats } from '@followw/core/queries/subjects.ts';

import { cn } from '#/lib/shadcn';

export const OCCUPANCY_COLOR: Record<Occupancy, string> = {
    free: 'text-primary',
    filling: 'text-warning',
    full: 'text-destructive'
};

export function Seats({ classroom }: { classroom: SubjectClassroom }) {
    const status = seats(classroom);
    if (!status) return null;
    const { available, occupancy } = status;
    return (
        <span
            className={cn('shrink-0 text-xs font-medium tabular-nums', OCCUPANCY_COLOR[occupancy])}
        >
            {available === 0 ? 'Cheia' : `${available} ${available === 1 ? 'vaga' : 'vagas'}`}
        </span>
    );
}
