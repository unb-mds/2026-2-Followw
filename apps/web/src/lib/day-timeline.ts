import type { Day, ScheduledClass } from '#/lib/schedule';

import { minutesOf } from '#/lib/schedule';

export function classProgress(
    start: string,
    end: string,
    date: string,
    now: Day & { time: string }
) {
    if (date < now.date) return 1;
    if (date > now.date) return 0;
    const duration = minutesOf(end) - minutesOf(start);
    return duration > 0
        ? Math.max(0, Math.min(1, (minutesOf(now.time) - minutesOf(start)) / duration))
        : 0;
}

export function dayTimeline<T>(
    classes: ScheduledClass<T>[],
    date: string,
    now: Day & { time: string }
) {
    return classes.map((entry, index) => {
        const previous = classes[index - 1];
        const gap = previous ? minutesOf(entry.start) - minutesOf(previous.end) : 0;
        return {
            ...entry,
            progress: classProgress(entry.start, entry.end, date, now),
            active: date === now.date && entry.start <= now.time && now.time < entry.end,
            gap: gap > 10 ? gap : 0,
            overlap: gap < 0
        };
    });
}
