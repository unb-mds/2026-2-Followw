import type { Lesson } from '../queries/classrooms.ts';

export function formatClassroomDate(date: string) {
    const [year, month, day] = date.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
}

export function formatClassroomDateTime(datetime: string) {
    return `${formatClassroomDate(datetime)} ${datetime.slice(11, 16)}`;
}

const weekdayFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

export function formatClassroomWeekday(date: string) {
    return weekdayFormat.format(new Date(`${date.slice(0, 10)}T00:00:00Z`)).replace('.', '');
}

const relativeFormat = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

export function daysFrom(today: string, date: string) {
    return Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

export function formatRelativeDays(days: number) {
    return relativeFormat.format(days, 'day');
}

export function formatRelativeDay(days: number) {
    const label = formatRelativeDays(days);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

// a UnB exige 75% de frequência: abaixo disso reprova, até 80% é alerta
export function frequencyTone(percentage: number) {
    if (percentage < 75) return 'danger';
    return percentage <= 80 ? 'warning' : 'ok';
}

export function groupBySemester<T extends { semester: string }>(classrooms: T[]) {
    const groups = new Map<string, T[]>();
    for (const classroom of classrooms) {
        groups.set(classroom.semester, [...(groups.get(classroom.semester) ?? []), classroom]);
    }
    return [...groups].toSorted(([a], [b]) => b.localeCompare(a));
}

export const CLASSROOM_TABS = ['frequency', 'statistics', 'posts', 'members'] as const;
export type ClassroomTab = (typeof CLASSROOM_TABS)[number];

// turma em andamento tem frequência; encerrada, estatísticas
export function classroomTab(tab: ClassroomTab, current: boolean): ClassroomTab {
    if (tab !== 'frequency' && tab !== 'statistics') return tab;
    return current ? 'frequency' : 'statistics';
}

const RUN_STATUSES = ['presente', 'falta', 'nao_registrada'] as const;

export type LessonRun = { id: string; status: (typeof RUN_STATUSES)[number]; count: number };

/** Aulas em ordem cronológica, agrupadas em sequências de mesma situação. */
export function lessonRuns(lessons: Lesson[]): LessonRun[] {
    const runs: LessonRun[] = [];
    for (const lesson of lessons.toReversed()) {
        if (lesson.status === 'cancelada') continue;
        const last = runs.at(-1);
        if (last?.status === lesson.status) last.count++;
        else runs.push({ id: lesson.id, status: lesson.status, count: 1 });
    }
    return runs;
}
