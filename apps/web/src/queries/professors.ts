import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type ProfessorDetails = components['schemas']['ProfessorDetails'];
export type ProfessorItem = components['schemas']['ProfessorItem'];
export type ProfessorDegree = components['schemas']['ProfessorDegree'];
export type ProfessorDiscipline = components['schemas']['ProfessorDiscipline'];
export type ProfessorPage = components['schemas']['ProfessorPage'];

export const professorQueryOptions = (siape: number) =>
    api.queryOptions('get', '/public/professors/{siape}', {
        params: {
            path: { siape }
        }
    });

export const professorsListQueryOptions = (params?: {
    q?: string | null;
    unit?: number | string | null;
    semester?: string | null;
    page?: number;
    page_size?: number;
}) =>
    api.queryOptions('get', '/public/professors', {
        params: {
            query: {
                q: params?.q ?? undefined,
                unit:
                    params?.unit !== null && params?.unit !== undefined
                        ? String(params.unit)
                        : undefined,
                semester: params?.semester ?? undefined,
                page: params?.page ?? 1,
                page_size: params?.page_size ?? 20
            }
        }
    });
