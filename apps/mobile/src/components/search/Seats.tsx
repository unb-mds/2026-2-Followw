import type { Occupancy, SubjectClassroom } from '@followw/core/queries/subjects.ts';

import { seats } from '@followw/core/queries/subjects.ts';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

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
        <Text className={cn('shrink-0 text-xs font-medium', OCCUPANCY_COLOR[occupancy])}>
            {available === 0 ? 'Cheia' : `${available} ${available === 1 ? 'vaga' : 'vagas'}`}
        </Text>
    );
}
