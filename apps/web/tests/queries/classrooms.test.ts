import { describe, expect, test } from 'bun:test';

import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions,
    gradesPollingInterval
} from '#/queries/classrooms';

describe('queries de turma', () => {
    test('acompanha menções históricas por no máximo dois minutos', () => {
        const pending = [{ current: false, grade: null }];
        expect(gradesPollingInterval(pending, 1000, 1000)).toBe(5000);
        expect(gradesPollingInterval(pending, 1000, 120999)).toBe(5000);
        expect(gradesPollingInterval(pending, 1000, 121000)).toBe(false);
        expect(gradesPollingInterval([{ current: false, grade: 'SS' }], 1000, 2000)).toBe(false);
        expect(gradesPollingInterval([{ current: true, grade: null }], 1000, 2000)).toBe(false);
        expect(gradesPollingInterval(undefined, 1000, 2000)).toBe(false);
    });
    test('consulta todas as turmas para abrir uma rota diretamente', () => {
        expect(allClassroomsQueryOptions.queryKey).toContainEqual({
            params: { query: { semester: 'all' } }
        });
    });

    test('isola postagens, frequência e participantes pelo ID da turma', () => {
        const first = 'TURMA-1';
        const second = 'TURMA-2';

        for (const query of [
            classroomPostsQueryOptions,
            classroomFrequencyQueryOptions,
            classroomMembersQueryOptions
        ]) {
            expect(query(first).queryKey).not.toEqual(query(second).queryKey);
        }
        expect(classroomPostDetailQueryOptions(first, 'news:1').queryKey).not.toEqual(
            classroomPostDetailQueryOptions(first, 'assessment:1').queryKey
        );
    });

    test('usa as rotas de posts com IDs opacos e filtro por categoria', () => {
        expect(classroomPostsQueryOptions('TURMA-1').queryKey[1]).toBe(
            '/classrooms/{classroom_id}/posts'
        );
        expect(classroomPostsQueryOptions('TURMA-1', 'material').queryKey).toContainEqual({
            params: { path: { classroom_id: 'TURMA-1' }, query: { type: 'material' } }
        });
        expect(classroomPostsQueryOptions('TURMA-1').queryKey).not.toEqual(
            classroomPostsQueryOptions('TURMA-1', 'material').queryKey
        );
        expect(classroomPostDetailQueryOptions('TURMA-1', 'material:abc').queryKey).toContainEqual({
            params: { path: { classroom_id: 'TURMA-1', post_id: 'material:abc' } }
        });
    });
});
