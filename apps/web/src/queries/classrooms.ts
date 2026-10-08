import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';

export type Classroom = components['schemas']['UserClassroom'];

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

export type ClassroomFrequency = components['schemas']['ClassroomFrequencyView'];
export type Lesson = components['schemas']['Lesson'];
export type LessonMarkStatus = components['schemas']['LessonMarkStatus'];

/** Marca a aula (`null` desmarca) e relê a frequência, que já volta com aulas e totais. */
export function useMarkLesson(id: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            lesson,
            status
        }: {
            lesson: Lesson;
            status: LessonMarkStatus | null;
        }) => {
            const url = '/classrooms/{classroom_id}/frequency/lessons/{occurred_on}/{position}';
            const path = {
                classroom_id: id,
                occurred_on: lesson.occurred_on,
                position: lesson.position
            };
            if (status) await apiClient.PUT(url, { params: { path }, body: { status } });
            else await apiClient.DELETE(url, { params: { path } });
        },
        onSettled: () =>
            queryClient.invalidateQueries({
                queryKey: classroomFrequencyQueryOptions(id).queryKey
            })
    });
}

export const classroomMembersQueryOptions = (id: string) =>
    api.queryOptions('get', '/classrooms/{classroom_id}/members', {
        params: { path: { classroom_id: id } }
    });
