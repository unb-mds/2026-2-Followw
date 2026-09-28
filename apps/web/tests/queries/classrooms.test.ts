import { describe, expect, test } from 'bun:test';

import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomNewsDetailQueryOptions,
    classroomNewsQueryOptions
} from '#/queries/classrooms';

describe('queries de turma', () => {
    test('consulta todas as turmas para abrir uma rota diretamente', () => {
        expect(allClassroomsQueryOptions.queryKey).toContainEqual({
            params: { query: { semester: 'all' } }
        });
    });

    test('isola notícias, frequência e participantes pelo ID da turma', () => {
        const first = 'TURMA-1';
        const second = 'TURMA-2';

        for (const query of [
            classroomNewsQueryOptions,
            classroomFrequencyQueryOptions,
            classroomMembersQueryOptions
        ]) {
            expect(query(first).queryKey).not.toEqual(query(second).queryKey);
        }
        expect(classroomNewsDetailQueryOptions(first, 1).queryKey).not.toEqual(
            classroomNewsDetailQueryOptions(first, 2).queryKey
        );
    });
});
