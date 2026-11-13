import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type CourseCurriculum = components['schemas']['CourseCurriculum'];
export type CurriculumSubject = components['schemas']['CurriculumSubject'];
export const shiftLabels: Record<NonNullable<CourseCurriculum['shift']>, string> = {
    D: 'Diurno',
    N: 'Noturno'
};

export const curriculumQueryOptions = (courseId: number, entrySemester: string) =>
    api.queryOptions('get', '/public/courses/{course_id}/curriculum', {
        params: { path: { course_id: courseId }, query: { entry_semester: entrySemester } }
    });
