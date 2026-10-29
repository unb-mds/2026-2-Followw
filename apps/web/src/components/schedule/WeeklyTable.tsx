import type { GridSemester } from '#/lib/planned-schedule';

import { classKey, GRID_DAYS } from '#/lib/planned-schedule';
import { cn } from '#/lib/shadcn';

export function WeeklyTable({
    grid: { semester, hours, rows, unscheduled },
    maxHours
}: {
    grid: GridSemester;
    maxHours: number | null;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col">
                <h3 className="text-base font-semibold">Semestre {semester}</h3>
                <p
                    className={cn(
                        'text-xs text-muted-foreground tabular-nums',
                        maxHours != null && hours > maxHours && 'text-destructive'
                    )}
                >
                    {maxHours == null ? `${hours}h` : `${hours}h de ${maxHours}h`}
                </p>
            </div>
            {rows.length > 0 && (
                <section
                    className="overflow-x-auto rounded-lg border"
                    aria-label={`Grade semanal ${semester}`}
                >
                    <table className="w-full min-w-2xl table-fixed border-collapse text-center text-xs">
                        <caption className="sr-only">Grade semanal · {semester}.</caption>
                        <thead className="bg-foreground text-background dark:bg-background dark:text-foreground">
                            <tr>
                                <th scope="col" className="w-24 p-2">
                                    Horários
                                </th>
                                {GRID_DAYS.map(({ label }) => (
                                    <th key={label} scope="col" className="p-2">
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ start, end, cells }) => (
                                <tr key={start} className="border-t">
                                    <th
                                        scope="row"
                                        className="bg-muted p-2 font-medium tabular-nums"
                                    >
                                        {start}–{end}
                                    </th>
                                    {cells.map((entry, index) => (
                                        <td
                                            key={GRID_DAYS[index].label}
                                            className={cn(
                                                'border-l p-2 align-middle',
                                                entry && 'bg-primary/5 text-primary'
                                            )}
                                        >
                                            {entry ? (
                                                <span title={entry.name} className="font-semibold">
                                                    {entry.code}
                                                    <span className="block font-normal">
                                                        T{entry.number}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
            {unscheduled.map((entry) => (
                <p key={classKey(entry)} className="text-sm text-muted-foreground">
                    {entry.code} · T{entry.number}: horário a definir.
                </p>
            ))}
        </div>
    );
}
