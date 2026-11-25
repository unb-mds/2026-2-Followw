import type { SubjectKind, SubjectsQuery } from '../queries/subjects.ts';

import { SUBJECT_KINDS } from '../queries/subjects.ts';
import { SCHEDULE_BLOCKS } from './schedule.ts';

export const startTimes = SCHEDULE_BLOCKS.map((block) => block[0][0]);
export const workloads = [15, 30, 45, 60, 75] as const;
export type Workload = number | '90+';
export const kindLabels: Record<SubjectKind, string> = {
    mandatory: 'Obrigatórias',
    optional: 'Optativas',
    free: 'Livres'
};

export interface SubjectFilterParams {
    kind: SubjectKind[];
    // dias de segunda (0) a domingo (6), sem repetição e em ordem
    days: string;
    start: string[];
    hours: Workload[];
    hideConflicts: boolean;
    hideUnavailable: boolean;
}

export const subjectFilterKeys = [
    'kind',
    'days',
    'start',
    'hours',
    'hideConflicts',
    'hideUnavailable'
] as const satisfies (keyof SubjectFilterParams)[];

export const emptySubjectFilters: SubjectFilterParams = {
    kind: [],
    days: '',
    start: [],
    hours: [],
    hideConflicts: false,
    hideUnavailable: false
};

/** O início de um bloco inclui os horários nele. */
export const blockStarts = (start: string) =>
    SCHEDULE_BLOCKS.find((block) => block[0][0] === start)?.map(([time]) => time) ?? [start];

export const hasSubjectFilters = (filters: SubjectFilterParams) =>
    subjectFilterKeys.some((key) => {
        const value = filters[key];
        return Array.isArray(value) ? value.length > 0 : Boolean(value);
    });

/** Títulos na ordem da matriz: obrigatórias, optativas e livres. */
export const kindsTitle = (kind: readonly SubjectKind[]) =>
    SUBJECT_KINDS.filter((value) => kind.includes(value))
        .map((value) => kindLabels[value])
        .join(' e ') || 'Matérias';

/** A consulta de matérias pelos filtros e pela `unit`; nulo quando nada restringe a oferta. */
export function subjectsQueryFrom(
    { kind, days, start, hours, hideUnavailable }: SubjectFilterParams,
    text: string | null,
    unit?: string
): SubjectsQuery | null {
    if (!kind.length && !days && !start.length && !hours.length && !unit) return null;
    return {
        q: text ?? undefined,
        unit,
        offered: true,
        available: hideUnavailable || undefined,
        kind: kind.length ? kind : undefined,
        days: days || undefined,
        start: start.length ? start.flatMap(blockStarts) : undefined,
        hours: hours.length ? hours : undefined
    };
}
