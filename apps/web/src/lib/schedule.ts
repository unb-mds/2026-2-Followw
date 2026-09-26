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
    // Junta blocos colados no mesmo dia, como `M5T1` (12:00–13:50).
    const merged: ClassTime[] = [];
    for (const time of times.toSorted(
        (a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)
    )) {
        const last = merged.at(-1);
        if (last && last.weekday === time.weekday && last.end === time.start) last.end = time.end;
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

/** Segunda a sábado da semana de `date`; no domingo, a semana que começa. */
export function weekDays(date: string): Day[] {
    const monday = new Date(`${date}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() + 1 - monday.getUTCDay());
    return nextDays(monday.toISOString().slice(0, 10), 6);
}

export interface ScheduledClass<T> extends ClassTime {
    item: T;
    status: 'in_progress' | 'next' | 'normal';
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
        const current = classes.find((c) => c.start <= time && time < c.end);
        if (current) current.status = 'in_progress';
        const next = classes.find((c) => c.start > time);
        if (next) next.status = 'next';
    }
    return classes;
}
