// Início e fim de cada horário do SIGAA da UnB, por turno.
const SLOTS: Record<string, [string, string][]> = {
    M: [
        ['08:00', '08:55'],
        ['08:55', '09:50'],
        ['10:00', '10:55'],
        ['10:55', '11:50'],
        ['12:00', '12:55']
    ],
    T: [
        ['12:55', '13:50'],
        ['14:00', '14:55'],
        ['14:55', '15:50'],
        ['16:00', '16:55'],
        ['16:55', '17:50'],
        ['18:00', '18:55']
    ],
    N: [
        ['19:00', '19:50'],
        ['19:50', '20:40'],
        ['20:50', '21:40'],
        ['21:40', '22:30']
    ]
};

export const SCHEDULE_SLOTS = Object.values(SLOTS).flat();

/** Do primeiro ao último horário ocupado, com os vagos entre eles. */
export function visibleSlots(times: { start: string; end: string }[]) {
    const used = SCHEDULE_SLOTS.filter(([start, end]) =>
        times.some((time) => start < time.end && end > time.start)
    );
    const first = used[0]?.[0];
    const last = used.at(-1)?.[1];
    return SCHEDULE_SLOTS.filter(([start, end]) => first && last && start >= first && end <= last);
}

// Intervalo máximo entre blocos para juntá-los, como o T6 (até 18:55) e o N1 (a partir de 19:00).
const MERGE_GAP_MINUTES = 5;

const getMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export interface ClassTime {
    /** 0 = domingo, como `Date.getDay()`. */
    weekday: number;
    start: string;
    end: string;
}

/** `35T23` -> terça e quinta, 14:00–15:50. No SIGAA, o dígito 2 é segunda-feira. */
export function parseSchedule(code: string | null | undefined): ClassTime[] {
    const times: ClassTime[] = [];
    for (const [, days, shift, slots] of (code ?? '').matchAll(/([1-7]+)([MTN])([1-6]+)/g)) {
        const ranges = Array.from(slots, (slot) => SLOTS[shift][Number(slot) - 1]).filter(Boolean);
        if (ranges.length === 0) continue;
        for (const day of days) {
            times.push({
                weekday: Number(day) - 1,
                start: ranges[0][0],
                end: ranges[ranges.length - 1][1]
            });
        }
    }
    // Junta blocos colados no mesmo dia, como `M5T1` (12:00–13:50) e `T6N1` (18:00–19:50).
    const merged: ClassTime[] = [];
    for (const time of times.toSorted(
        (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)
    )) {
        const last = merged.at(-1);
        if (
            last &&
            last.weekday === time.weekday &&
            getMinutes(time.start) - getMinutes(last.end) <= MERGE_GAP_MINUTES
        )
            last.end = time.end;
        else merged.push(time);
    }
    return merged;
}

/** `35T23` -> `Ter, Qui · 14:00–15:50`. */
export function describeSchedule(code: string | null | undefined): string | undefined {
    const byRange = new Map<string, string[]>();
    for (const { weekday, start, end } of parseSchedule(code)) {
        const range = `${start}–${end}`;
        byRange.set(range, [...(byRange.get(range) ?? []), WEEKDAYS_SHORT[weekday]]);
    }
    if (byRange.size === 0) return code ?? undefined;
    return [...byRange].map(([range, days]) => `${days.join(', ')} · ${range}`).join(' | ');
}

export interface Day {
    /** `AAAA-MM-DD` */
    date: string;
    weekday: number;
}

const brasiliaFormat = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
});

/** Data e hora de Brasília, para o SSR e o navegador concordarem. */
export function nowInBrasilia(now = new Date()): Day & { time: string } {
    const parts = Object.fromEntries(
        brasiliaFormat.formatToParts(now).map(({ type, value }) => [type, value])
    );
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    return {
        date,
        weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
        time: `${parts.hour}:${parts.minute}`
    };
}

/** `count` dias seguidos a partir de `start`. */
export function nextDays(start: string, count: number): Day[] {
    const base = new Date(`${start}T00:00:00Z`);
    return Array.from({ length: count }, (_, offset) => {
        const day = new Date(base);
        day.setUTCDate(base.getUTCDate() + offset);
        return { date: day.toISOString().slice(0, 10), weekday: day.getUTCDay() };
    });
}

/** `2026-10-14` + 7 -> `2026-10-21`. */
export function addDays(date: string, days: number): string {
    const day = new Date(`${date}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
}

/** Segunda a sábado da semana de `date`; com `count = 7`, vai de segunda a domingo da mesma semana. */
export function weekDays(date: string, count = 6): Day[] {
    const monday = new Date(`${date}T00:00:00Z`);
    const day = monday.getUTCDay();
    const diff = count === 7 && day === 0 ? -6 : 1 - day;
    monday.setUTCDate(monday.getUTCDate() + diff);
    return nextDays(monday.toISOString().slice(0, 10), count);
}

export interface ScheduledClass<T> extends ClassTime {
    item: T;
    status: 'in_progress' | 'next' | 'normal';
}

export function currentAndNext<T extends { start: string; end: string }>(items: T[], time: string) {
    return {
        current: items.find((item) => item.start <= time && time < item.end),
        next: items.find((item) => item.start > time)
    };
}

/** Aulas do dia em ordem; `time` (HH:MM) marca a aula em andamento e a próxima. */
export function classesOn<T extends { schedule?: string | null }>(
    items: T[],
    weekday: number,
    time?: string
): ScheduledClass<T>[] {
    const classes = items
        .flatMap((item) =>
            parseSchedule(item.schedule)
                .filter((slot) => slot.weekday === weekday)
                .map(({ start, end }): ScheduledClass<T> => ({
                    weekday,
                    start,
                    end,
                    item,
                    status: 'normal'
                }))
        )
        .toSorted((a, b) => a.start.localeCompare(b.start));

    if (time) {
        const { current, next } = currentAndNext(classes, time);
        if (current) current.status = 'in_progress';
        if (next) next.status = 'next';
    }
    return classes;
}
