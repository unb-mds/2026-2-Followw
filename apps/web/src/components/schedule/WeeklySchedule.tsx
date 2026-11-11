import { useMemo } from 'react';

import { GRID_DAYS } from '#/lib/planned-schedule';
import { parseSchedule } from '#/lib/schedule';
import { cn } from '#/lib/shadcn';
import {
    dayLanes,
    formatMinutes,
    timePosition,
    timeTicks,
    weeklyTimeline
} from '#/lib/weekly-timeline';

const TIMELINE_INSET = 12;

export interface WeeklyEntry {
    key: string;
    code: string;
    name: string;
    number: string;
    schedule?: string | null;
}

export function WeeklySchedule({
    entries,
    label,
    onSelect
}: {
    entries: WeeklyEntry[];
    label: string;
    onSelect?: (key: string) => void;
}) {
    const times = useMemo(
        () =>
            entries.flatMap((entry) =>
                parseSchedule(entry.schedule).map((time) => Object.assign(time, { entry }))
            ),
        [entries]
    );
    const segments = weeklyTimeline(times);
    const ticks = timeTicks(segments);
    const last = segments.at(-1);
    const height = last ? last.top + last.height : 0;

    return (
        <section aria-label={label} className="min-w-0">
            {segments.length > 0 && (
                <div className="weekly-scroll max-h-144 overflow-auto overscroll-contain rounded-xl border">
                    <div className="min-w-md">
                        <div className="weekly-columns sticky top-0 z-20 grid border-b bg-card text-center text-xs text-muted-foreground">
                            <span className="p-3">Hora</span>
                            {GRID_DAYS.map(({ label: day }) => (
                                <span key={day} className="py-3 font-medium">
                                    {day}
                                </span>
                            ))}
                        </div>
                        <div
                            className="weekly-columns relative grid"
                            style={{ height: height + TIMELINE_INSET * 2 }}
                        >
                            <div className="relative border-r bg-card">
                                {ticks.map(({ minute, top }) => (
                                    <span
                                        key={minute}
                                        className="absolute left-1 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                                        style={{ top: top + TIMELINE_INSET }}
                                    >
                                        {formatMinutes(minute)}
                                    </span>
                                ))}
                            </div>
                            {ticks.map(({ minute, top }) => (
                                <div
                                    key={minute}
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-0 left-13 border-t border-dashed border-border/60"
                                    style={{ top: top + TIMELINE_INSET }}
                                />
                            ))}
                            {GRID_DAYS.map(({ weekday, label: day }) => (
                                <div
                                    key={weekday}
                                    className="relative border-r border-dashed last:border-r-0"
                                >
                                    {dayLanes(times.filter((time) => time.weekday === weekday)).map(
                                        ({ entry, start, end, lane, lanes }) => {
                                            const top = timePosition(start, segments);
                                            const style = {
                                                top: top + TIMELINE_INSET + 1,
                                                height: Math.max(
                                                    16,
                                                    timePosition(end, segments) - top - 2
                                                ),
                                                left: `calc(${(lane / lanes) * 100}% + 2px)`,
                                                width: `calc(${100 / lanes}% - 4px)`
                                            };
                                            const description = `${day}, ${start}–${end}: ${entry.name}, ${entry.code}, turma ${entry.number}`;
                                            const content = (
                                                <>
                                                    <span className="block truncate font-semibold">
                                                        {entry.code}
                                                    </span>
                                                    <span className="block truncate text-muted-foreground">
                                                        T{entry.number}
                                                    </span>
                                                </>
                                            );
                                            const className =
                                                'absolute flex flex-col justify-center overflow-hidden rounded-lg border border-primary/30 bg-primary/5 px-1 py-2 text-center text-xs text-primary';
                                            return onSelect ? (
                                                <button
                                                    key={`${entry.key}-${start}`}
                                                    type="button"
                                                    title={description}
                                                    aria-label={description}
                                                    style={style}
                                                    className={cn(
                                                        className,
                                                        'transition-colors hover:bg-primary/15 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring'
                                                    )}
                                                    onClick={() => onSelect(entry.key)}
                                                >
                                                    {content}
                                                </button>
                                            ) : (
                                                <figure
                                                    key={`${entry.key}-${start}`}
                                                    aria-label={description}
                                                    title={description}
                                                    style={style}
                                                    className={className}
                                                >
                                                    {content}
                                                </figure>
                                            );
                                        }
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {entries
                .filter((entry) => parseSchedule(entry.schedule).length === 0)
                .map((entry) => (
                    <p key={entry.key} className="mt-3 text-sm text-muted-foreground">
                        {entry.code} · T{entry.number}: horário a definir.
                    </p>
                ))}
        </section>
    );
}
