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

export const TURNOS = ['Todos', 'Manhã', 'Tarde', 'Noite'] as const;
export type Turno = (typeof TURNOS)[number];
const SHIFTS: Record<Turno, string | null> = { Todos: null, Manhã: 'M', Tarde: 'T', Noite: 'N' };
export const AVAILABILITIES = ['Todas', 'Disponíveis', 'Indisponíveis'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const isTurno = (value: string): value is Turno =>
    (TURNOS as readonly string[]).includes(value);
export const isAvailability = (value: string): value is Availability =>
    (AVAILABILITIES as readonly string[]).includes(value);

export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 32;
const APPROVED = new Set(['SS', 'MS', 'MM']);

/** Sem texto, lista a unidade; texto fora dos limites mantém a consulta anterior. */
export function subjectsQuery(
    busca: string,
    unit: string | null,
    previous: SubjectsQuery | null = unit ? { unit } : null
): SubjectsQuery | null {
    const text = busca.trim();
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

export function availableSeats(classroom: SubjectClassroom): number | null {
    if (classroom.vacancies == null || classroom.occupied == null) return null;
    return Math.max(0, classroom.vacancies - classroom.occupied);
}

export function lockedReasons(classroom: SubjectClassroom, met: boolean | null): string[] {
    const reasons = [];
    if (availableSeats(classroom) === 0) reasons.push('Turma cheia');
    if (met === false) reasons.push('Pré-requisitos não atendidos');
    return reasons;
}

const hasShift = (schedule: string | null | undefined, turno: Turno) =>
    !SHIFTS[turno] || new RegExp(`[1-7]+${SHIFTS[turno]}[1-6]+`).test(schedule ?? '');

/** Filtra as turmas no cliente e descarta as matérias que ficaram sem nenhuma. */
export function filterSubjects(
    subjects: CatalogSubject[],
    { turno, disponibilidade }: { turno: Turno; disponibilidade: Availability },
    approved: Set<string> | null
): CatalogSubject[] {
    return subjects.flatMap((subject) => {
        const met = prerequisitesMet(subject.prerequisites, approved);
        const classrooms = subject.classrooms.filter((classroom) => {
            const locked = lockedReasons(classroom, met).length > 0;
            if (disponibilidade === 'Disponíveis' && locked) return false;
            if (disponibilidade === 'Indisponíveis' && !locked) return false;
            return hasShift(classroom.schedule, turno);
        });
        return classrooms.length > 0 ? [{ ...subject, classrooms }] : [];
    });
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
