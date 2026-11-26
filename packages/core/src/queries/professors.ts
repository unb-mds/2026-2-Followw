import type { components } from './schema.gen.ts';

import { groupBySemester } from '../lib/classroom-details.ts';
import { api } from './api.ts';

export type ProfessorDetails = components['schemas']['ProfessorDetails'];
export type ProfessorItem = components['schemas']['ProfessorItem'];
export type ProfessorPage = components['schemas']['ProfessorPage'];
export type ProfessorDegree = components['schemas']['ProfessorDegree'];
export type ProfessorDiscipline = components['schemas']['TaughtDiscipline'];

export const professorQueryOptions = (siape: number) =>
    api.queryOptions('get', '/public/professors/{siape}', {
        params: {
            path: { siape }
        }
    });

export const professorsQueryOptions = (q: string | null, page = 1) =>
    api.queryOptions('get', '/public/professors', {
        params: { query: { q: q ?? undefined, page } }
    });

/** Disciplinas do docente por semestre, do mais recente, cada grupo em ordem de código. */
export const disciplinesBySemester = (disciplines: ProfessorDiscipline[]) =>
    groupBySemester(disciplines).map(([semester, items]) => ({
        semester,
        items: items.toSorted((a, b) => a.code.localeCompare(b.code))
    }));
