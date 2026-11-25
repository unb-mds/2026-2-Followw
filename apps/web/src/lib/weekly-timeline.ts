import type { ClassTime } from '@followw/core/lib/schedule.ts';

import { minutesOf } from '@followw/core/lib/schedule.ts';

const PIXELS_PER_MINUTE = 0.8;

export interface TimeRange {
    start: number;
    end: number;
}

export const formatMinutes = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

/** Da hora cheia da primeira aula à da última, de segunda a sábado; nulo sem aulas. */
export function weeklyTimeline(times: ClassTime[]): TimeRange | null {
    const week = times.filter(({ weekday }) => weekday >= 1 && weekday <= 6);
    if (!week.length) return null;
    return {
        start: Math.floor(Math.min(...week.map(({ start }) => minutesOf(start))) / 60) * 60,
        end: Math.ceil(Math.max(...week.map(({ end }) => minutesOf(end))) / 60) * 60
    };
}

export const timePosition = (time: string, { start }: TimeRange) =>
    (minutesOf(time) - start) * PIXELS_PER_MINUTE;

export const timelineHeight = ({ start, end }: TimeRange) => (end - start) * PIXELS_PER_MINUTE;

export function timeTicks(range: TimeRange | null) {
    if (!range) return [];
    const ticks = [];
    for (let minute = range.start; minute <= range.end; minute += 60)
        ticks.push({ minute, top: (minute - range.start) * PIXELS_PER_MINUTE });
    return ticks;
}

export function dayLanes<T extends ClassTime>(times: T[]) {
    const groups: { end: string; items: (T & { lane: number })[] }[] = [];
    for (const time of times.toSorted((a, b) => a.start.localeCompare(b.start))) {
        let group = groups.at(-1);
        if (!group || time.start >= group.end) {
            group = { end: time.end, items: [] };
            groups.push(group);
        }
        const occupied = new Set(
            group.items.filter((entry) => entry.end > time.start).map(({ lane }) => lane)
        );
        let lane = 0;
        while (occupied.has(lane)) lane++;
        group.items.push({ ...time, lane });
        if (time.end > group.end) group.end = time.end;
    }
    return groups.flatMap(({ items }) => {
        const lanes = Math.max(...items.map(({ lane }) => lane)) + 1;
        return items.map((item) => ({ ...item, lanes }));
    });
}
