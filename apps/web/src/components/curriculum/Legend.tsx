import { cn } from 'cn';

import type { AcademicState } from '#/lib/curriculum/types';

import { Badge } from '#/components/ui/badge';
import { stateLabels } from '#/lib/curriculum/model';

const legendStyles: Record<Exclude<AcademicState, 'unknown'>, string> = {
    completed: 'bg-success/10 text-success',
    enrolled: 'bg-info/10 text-info',
    pending: 'bg-muted text-muted-foreground',
    overdue: 'bg-destructive/10 text-destructive'
};
export function Legend() {
    return (
        <ul aria-label="Legenda dos estados acadêmicos" className="flex justify-center gap-2">
            {(['completed', 'enrolled', 'pending', 'overdue'] as const).map((state) => (
                <li key={state}>
                    <Badge className={cn('h-5', legendStyles[state])}>
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                        {stateLabels[state]}
                    </Badge>
                </li>
            ))}
        </ul>
    );
}
