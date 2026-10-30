import { stateLabels, type AcademicState } from '#/lib/curriculum/model';
import { cn } from '#/lib/shadcn';

const legendStyles = {
    completed: 'bg-success/10 text-success',
    enrolled: 'bg-info/10 text-info',
    pending: 'bg-muted text-muted-foreground',
    overdue: 'bg-destructive/10 text-destructive'
};
export function Legend() {
    return (
        <ul
            aria-label="Legenda dos estados acadêmicos"
            className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 justify-center gap-3"
        >
            {(['completed', 'enrolled', 'pending', 'overdue'] as const).map((state) => (
                <li
                    key={state}
                    className={cn(
                        'flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap xl:px-5',
                        legendStyles[state]
                    )}
                >
                    <span aria-hidden="true">●</span>
                    {stateLabels[state as AcademicState]}
                </li>
            ))}
        </ul>
    );
}
