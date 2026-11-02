import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type PublicCourse = components['schemas']['PublicCourse'];

export const courseQueryOptions = (courseId: number) =>
    api.queryOptions('get', '/public/courses/{course_id}', {
        params: { path: { course_id: courseId } }
    });
