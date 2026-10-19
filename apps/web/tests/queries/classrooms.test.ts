import { describe, expect, test } from 'bun:test';

import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomPostDetailQueryOptions,
    classroomPostsQueryOptions
} from '#/queries/classrooms';

describe('queries de turma', () => {
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
