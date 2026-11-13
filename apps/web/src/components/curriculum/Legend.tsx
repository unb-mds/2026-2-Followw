import type { AcademicState } from '@followw/core/lib/curriculum/types.ts';

import { stateLabels } from '@followw/core/lib/curriculum/model.ts';
import { cn } from 'cn';

import { Badge } from '#/components/ui/badge';

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
