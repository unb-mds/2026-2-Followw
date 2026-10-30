import type { Classroom } from '#/queries/classrooms';
import type { components, operations } from '#/queries/schema.gen';

import { api } from '#/queries/api';
import { finalGrade } from '#/queries/classrooms';

export type CatalogSubject = components['schemas']['CatalogSubject'];
export type SubjectClassroom = components['schemas']['SubjectClassroom'];
export type Requirements = components['schemas']['CatalogRequirements'];
export type SubjectKind = NonNullable<CatalogSubject['kind']>;

export const subjectKindLabels: Record<SubjectKind, string> = {
    mandatory: 'Obrigatória',
    optional: 'Optativa',
    free: 'Módulo livre'
};
export type SubjectsQuery = NonNullable<
    operations['search_subjects_public_subjects_get']['parameters']['query']
>;

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 32;
const APPROVED = new Set(['SS', 'MS', 'MM']);

/** Texto válido da busca; fora dos limites mantém o anterior. */
export function searchText(q: string, previous: string | null = null): string | null {
    const text = q.trim();
    if (!text) return null;
    return text.length < SEARCH_MIN_LENGTH || text.length > SEARCH_MAX_LENGTH ? previous : text;
}

/** Com texto busca por ele; sem texto, lista a unidade. */
export const subjectsQuery = (text: string | null, unit: string | null): SubjectsQuery | null =>
    text ? { q: text } : unit ? { unit } : null;

export const subjectsQueryOptions = (query: SubjectsQuery) =>
    api.queryOptions('get', '/public/subjects', { params: { query } });

export function approvedCodes(history: Classroom[]): Set<string> {
    return new Set(
        history.filter((c) => APPROVED.has(finalGrade(c) ?? '')).map((c) => c.subject.code)
    );
}

export function takenCodes(history: Classroom[]): Set<string> {
    const taken = approvedCodes(history);
    for (const c of history) if (c.status === 'cursando') taken.add(c.subject.code);
    return taken;
}

export const subjectRequirementLabel = ({ code, subject }: Requirements[number][number]) =>
    subject?.name ?? code;

export type Occupancy = 'free' | 'filling' | 'full';

export interface Seats {
    vacancies: number;
    occupied: number;
    available: number;
    occupancy: Occupancy;
}

/** Cheia a partir de 100% e enchendo acima de 75%; `null` sem os números do SIGAA. */
export function seats({ vacancies, occupied }: SubjectClassroom): Seats | null {
    if (vacancies == null || occupied == null) return null;
    const ratio = vacancies > 0 ? occupied / vacancies : 1;
    return {
        vacancies,
        occupied,
        available: Math.max(0, vacancies - occupied),
        occupancy: ratio >= 1 ? 'full' : ratio > 0.75 ? 'filling' : 'free'
    };
}

export const withClassrooms = (subjects: CatalogSubject[]) =>
    subjects.filter((subject) => subject.classrooms.length > 0);

export function currentCurriculumPeriod(
    entry: string | null | undefined,
    semester: string | undefined
): number | null {
    if (!entry || !semester || !/^\d{4}\.[12]$/.test(entry) || !/^\d{4}\.[12]$/.test(semester))
        return null;
    const [entryYear, entryTerm] = entry.split('.').map(Number);
    const [year, term] = semester.split('.').map(Number);
    const period = (year - entryYear) * 2 + term - entryTerm + 1;
    return period > 0 ? period : null;
}
