import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

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

export const professorsQueryOptions = (q: string) =>
    api.queryOptions('get', '/public/professors', {
        params: {
            query: { q }
        }
    });

// nomes de docentes não têm dígitos: buscar por código de matéria não consulta docentes
export function professorSearch(q: string | null | undefined): string | null {
    return q && !/\d/.test(q) ? q : null;
}
