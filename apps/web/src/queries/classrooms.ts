import type { components } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';

export type Classroom = components['schemas']['Classroom'];

export const classroomsQueryOptions = api.queryOptions('get', '/classrooms');

export const allClassroomsQueryOptions = api.queryOptions('get', '/classrooms', {
    params: { query: { semester: 'all' } }
});

export const classroomNewsQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/news', {
        params: { path: { classroom_id: id } }
    });

export const classroomNewsDetailQueryOptions = (id: string, newsId: number) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/news/{news_id}', {
        params: { path: { classroom_id: id, news_id: newsId } }
    });

export const classroomFrequencyQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/frequency', {
        params: { path: { classroom_id: id } }
    });

export const classroomMembersQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/members', {
        params: { path: { classroom_id: id } }
    });
