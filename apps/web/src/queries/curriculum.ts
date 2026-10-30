import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type CourseCurriculum = components['schemas']['CourseCurriculum'];
export type CurriculumSubject = components['schemas']['CurriculumSubject'];
export type CurriculumRequirements = components['schemas']['Requirements'];

export const curriculumQueryOptions = (courseId: number, entrySemester: string) =>
    api.queryOptions('get', '/public/courses/{course_id}/curriculum', {
        params: { path: { course_id: courseId }, query: { entry_semester: entrySemester } }
    });
