import type { SubjectClassroom } from '#/queries/subjects';

import { groupBySemester } from '#/lib/classroom-details';
import { STORAGE_KEYS, storedValue } from '#/lib/local-storage';
import { overlaps, parseSchedule, visibleSlots, WEEKDAYS_SHORT } from '#/lib/schedule';

export interface PlannedClass extends SubjectClassroom {
    code: string;
    name: string;
    hours: number | null;
}

const EMPTY: PlannedClass[] = [];

export const plannedSchedule = storedValue(STORAGE_KEYS.SCHEDULE, EMPTY);

export const classKey = ({ code, semester, number }: PlannedClass) =>
    `${code}-${semester}-${number}`;

const totalHours = (items: PlannedClass[]) =>
    items.reduce((total, item) => total + (item.hours ?? 0), 0);

/** Por que a turma não entra na grade: matéria repetida, choque de horário ou carga máxima. */
export function addError(
    items: PlannedClass[],
    item: PlannedClass,
    maxHours: number | null
): string | null {
    const semester = items.filter((entry) => entry.semester === item.semester);
    const repeated = semester.find((entry) => entry.code === item.code);
    if (repeated) {
        return `${item.name} (${item.code}) já está na grade do semestre ${item.semester}, na turma ${repeated.number}.`;
    }
    const times = parseSchedule(item.schedule);
    const clash = semester.find((entry) =>
        parseSchedule(entry.schedule).some((existing) =>
            times.some((time) => overlaps(time, existing))
        )
    );
    if (clash) {
        return `O horário de ${item.name} (${item.code}) conflita com ${clash.name} (${clash.code}), turma ${clash.number}.`;
    }
    if (maxHours != null && totalHours(semester) + (item.hours ?? 0) > maxHours) {
        return `Adicionar ${item.name} ultrapassa a carga horária máxima de ${maxHours}h no semestre ${item.semester}.`;
    }
    return null;
}

/** Segunda a sábado, como `Date.getDay()`. */
export const GRID_DAYS = WEEKDAYS_SHORT.slice(1).map((label, index) => ({
    label,
    weekday: index + 1
}));

export interface GridRow {
    start: string;
    end: string;
    /** Uma célula por dia de `GRID_DAYS`; a grade não aceita choques. */
    cells: (PlannedClass | undefined)[];
}

/** Grade semanal por semestre, desenhada tanto no modal quanto na imagem. */
export function weeklyGrid(items: PlannedClass[]) {
    return groupBySemester(items).map(([semester, classes]) => {
        const timed = classes.map((item) => ({ item, times: parseSchedule(item.schedule) }));
        const rows = visibleSlots(timed.flatMap(({ times }) => times)).map(
            ([start, end]): GridRow => ({
                start,
                end,
                cells: GRID_DAYS.map(
                    ({ weekday }) =>
                        timed.find(({ times }) =>
                            times.some((time) => overlaps(time, { weekday, start, end }))
                        )?.item
                )
            })
        );
        return {
            semester,
            classes,
            hours: totalHours(classes),
            rows,
            unscheduled: timed.filter(({ times }) => times.length === 0).map(({ item }) => item)
        };
    });
}

export type GridSemester = ReturnType<typeof weeklyGrid>[number];
