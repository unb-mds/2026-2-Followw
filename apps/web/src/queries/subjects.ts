import type { Classroom } from '#/queries/classrooms';
import type { components, operations } from '#/queries/schema.gen';

import { api } from '#/queries/api';
import { finalGrade } from '#/queries/classrooms';

export type CatalogSubject = components['schemas']['CatalogSubject'];
export type SubjectClassroom = components['schemas']['SubjectClassroom'];
export type Requirements = components['schemas']['CatalogRequirements'];
export type SubjectKind = NonNullable<CatalogSubject['kind']>;
type RequirementFields = Pick<
    CatalogSubject,
    | 'prerequisites'
    | 'corequisites'
    | 'equivalences'
    | 'curriculum_prerequisites'
    | 'curriculum_corequisites'
    | 'offered_equivalences'
>;

export const subjectKindLabels: Record<SubjectKind, string> = {
    mandatory: 'Obrigatória',
    optional: 'Optativa',
    free: 'Módulo livre'
};
export type SubjectsQuery = NonNullable<
    operations['search_subjects_public_subjects_get']['parameters']['query']
>;

/** Requisitos que a API filtra para exibição; sem o filtro, os completos. */
export function displayedRequirements(subject: RequirementFields) {
    return {
        prerequisites: subject.curriculum_prerequisites ?? subject.prerequisites,
        corequisites: subject.curriculum_corequisites ?? subject.corequisites,
        equivalences: subject.offered_equivalences ?? subject.equivalences
    };
}

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 32;
const APPROVED = new Set(['SS', 'MS', 'MM']);

/** Texto válido da busca; fora dos limites mantém o anterior. */
export function searchText(q: string, previous: string | null = null): string | null {
    const text = q.trim();
    if (!text) return null;
    return text.length < SEARCH_MIN_LENGTH || text.length > SEARCH_MAX_LENGTH ? previous : text;
}

export const subjectsQueryOptions = (query: SubjectsQuery) =>
    api.queryOptions('get', '/public/subjects', { params: { query } });

export function approvedCodes(history: Classroom[]): Set<string> {
    return new Set(
        history.filter((c) => APPROVED.has(finalGrade(c) ?? '')).map((c) => c.subject.code)
    );
}

export function takenCodes(history: Classroom[], approved = approvedCodes(history)): Set<string> {
    const taken = new Set(approved);
    for (const c of history) if (c.status === 'cursando') taken.add(c.subject.code);
    return taken;
}

/** Feita pela própria matéria ou por um grupo inteiro de equivalências (grupo vazio não vale). */
export function covered(
    codes: Set<string> | null | undefined,
    { code, equivalences }: Pick<CatalogSubject, 'code' | 'equivalences'>
): boolean {
    if (!codes) return false;
    return (
        codes.has(code) ||
        (equivalences?.some((group) => group.length > 0 && group.every((r) => codes.has(r.code))) ??
            false)
    );
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
