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
type SubjectsQuery = NonNullable<
    operations['search_subjects_public_subjects_get']['parameters']['query']
>;

export const TIPOS = ['Todas', 'Obrigatórias', 'Optativas'] as const;
export type Tipo = (typeof TIPOS)[number];
const KINDS: Record<Tipo, SubjectKind | null> = {
    Todas: null,
    Obrigatórias: 'mandatory',
    Optativas: 'optional'
};

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 32;
const APPROVED = new Set(['SS', 'MS', 'MM']);

/** Sem texto, lista a unidade; texto fora dos limites mantém a consulta anterior. */
export function subjectsQuery(
    q: string,
    unit: string | null,
    previous: SubjectsQuery | null = unit ? { unit } : null
): SubjectsQuery | null {
    const text = q.trim();
    if (!text) return unit ? { unit } : null;
    if (text.length < SEARCH_MIN_LENGTH || text.length > SEARCH_MAX_LENGTH) return previous;
    return { q: text };
}

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

/** OU de Es pelos códigos aprovados; `null` sem histórico para comparar. */
export function prerequisitesMet(
    requirements: Requirements | null | undefined,
    approved: Set<string> | null
): boolean | null {
    if (!requirements?.length) return true;
    if (!approved) return null;
    return requirements.some((group) => group.every(({ code }) => approved.has(code)));
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

export function lockedReasons(classroom: SubjectClassroom, met: boolean | null): string[] {
    const reasons = [];
    if (seats(classroom)?.available === 0) reasons.push('Turma cheia');
    if (met === false) reasons.push('Pré-requisitos não atendidos');
    return reasons;
}

/** Igual ao `lookup_key` da API: sem acento, minúscula e com espaços colapsados. */
const lookupKey = (value: string) =>
    value
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .join(' ');

/** Mesmos campos da busca da API: código, nome e professores. */
function matchesText(subject: CatalogSubject, text: string) {
    const needle = lookupKey(text);
    if (!needle) return true;
    return [
        subject.code,
        subject.name,
        ...subject.classrooms.flatMap((classroom) => classroom.professors)
    ].some((value) => lookupKey(value).includes(needle));
}

export const withClassrooms = (subjects: CatalogSubject[]) =>
    subjects.filter((subject) => subject.classrooms.length > 0);

/** Filtra no cliente por tipo e texto, descartando as matérias sem turmas. */
export function filterSubjects(
    subjects: CatalogSubject[],
    { tipo, q }: { tipo: Tipo; q: string }
): CatalogSubject[] {
    return withClassrooms(subjects).filter(
        (subject) => (!KINDS[tipo] || subject.kind === KINDS[tipo]) && matchesText(subject, q)
    );
}

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
