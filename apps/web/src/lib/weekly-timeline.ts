import type { GridRow } from '#/lib/planned-schedule';
import type { ClassTime } from '#/lib/schedule';

import { minutesOf } from '#/lib/schedule';

export interface TimeSegment {
    start: number;
    end: number;
    top: number;
    height: number;
    omitted: boolean;
}

export const formatMinutes = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;

export function weeklyTimeline(times: ClassTime[]) {
    const ranges: { start: number; end: number }[] = [];
    for (const time of times
        .filter(({ weekday }) => weekday >= 1 && weekday <= 6)
        .toSorted((a, b) => a.start.localeCompare(b.start))) {
        const start = minutesOf(time.start);
        const end = minutesOf(time.end);
        const last = ranges.at(-1);
        if (last && start <= last.end) last.end = Math.max(last.end, end);
        else ranges.push({ start, end });
    }
    if (!ranges.length) return [];
    const segments: TimeSegment[] = [];
    const push = (start: number, end: number, omitted: boolean) => {
        if (end <= start) return;
        const previous = segments.at(-1);
        segments.push({
            start,
            end,
            omitted,
            top: previous ? previous.top + previous.height : 0,
            height: omitted ? 0 : (end - start) * 0.8
        });
    };
    let start = ranges[0].start;
    let occupiedEnd = ranges[0].end;
    for (const range of ranges.slice(1)) {
        if (range.start - occupiedEnd >= 120) {
            const end = Math.ceil(occupiedEnd / 60) * 60;
            const next = Math.floor(range.start / 60) * 60;
            push(Math.floor(start / 60) * 60, end, false);
            push(end, next, true);
            start = range.start;
        }
        occupiedEnd = range.end;
    }
    push(Math.floor(start / 60) * 60, Math.ceil(occupiedEnd / 60) * 60, false);
    return segments;
}

export function timePosition(time: string, segments: TimeSegment[]) {
    const value = minutesOf(time);
    const segment = segments.find(({ start, end }) => start <= value && value <= end);
    if (!segment) return 0;
    return segment.top + ((value - segment.start) / (segment.end - segment.start)) * segment.height;
}

export function timeTicks(segments: TimeSegment[]) {
    const ticks = segments
        .filter(({ omitted }) => !omitted)
        .flatMap((segment) => {
            const minutes = [];
            for (let minute = segment.start; minute < segment.end; minute += 60)
                minutes.push(minute);
            return minutes.map((minute) => ({
                minute,
                top: segment.top + (minute - segment.start) * 0.8
            }));
        });
    const last = segments.at(-1);
    if (last) ticks.push({ minute: last.end, top: last.top + last.height });
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

export function compactGridRows(rows: GridRow[]): (GridRow & { omitted?: boolean })[] {
    const result: (GridRow & { omitted?: boolean })[] = [];
    for (let index = 0; index < rows.length;) {
        const row = rows[index];
        if (row.cells.some(Boolean)) {
            result.push(row);
            index++;
            continue;
        }
        let end = index + 1;
        while (end < rows.length && !rows[end].cells.some(Boolean)) end++;
        const startTime = rows[index - 1]?.end ?? row.start;
        const endTime = rows[end]?.start ?? rows[end - 1].end;
        if (minutesOf(endTime) - minutesOf(startTime) >= 120)
            result.push({ start: startTime, end: endTime, cells: [], omitted: true });
        else result.push(...rows.slice(index, end));
        index = end;
    }
    return result;
}
