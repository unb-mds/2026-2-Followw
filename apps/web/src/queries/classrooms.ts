import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen.ts';

import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';

export type Classroom = components['schemas']['ParticipantClassroom'];

/** A menção vale nas turmas encerradas; nas atuais, quem ocupa o lugar dela é o local. */
export const finalGrade = (classroom: Classroom) =>
    classroom.current ? null : (classroom.grade ?? null);

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
export type LessonMarkStatus = NonNullable<components['schemas']['LessonMarkBody']['status']>;

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
            const url = '/classrooms/{classroom_id}/frequency/lessons/{lesson_id}';
            const path = { classroom_id: id, lesson_id: lesson.id };
            const { error } = await apiClient.PATCH(url, { params: { path }, body: { status } });
            if (error) throw new Error('Não foi possível salvar a marcação');
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
