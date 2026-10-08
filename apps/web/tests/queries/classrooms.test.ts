import { describe, expect, test } from 'bun:test';

import {
    allClassroomsQueryOptions,
    classroomFrequencyQueryOptions,
    classroomMembersQueryOptions,
    classroomNewsDetailQueryOptions,
    classroomNewsQueryOptions,
    updateManualFrequencyEntries
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

    test('atualiza a marcação no cache sem esperar o servidor e permite desfazer', () => {
        const present = {
            occurred_on: '2026-10-05',
            position: 0,
            status: 'presente',
            manual: true
        } as const;
        const absent = { ...present, status: 'ausente' } as const;
        const other = {
            occurred_on: '2026-10-06',
            position: 0,
            status: 'cancelada',
            manual: true
        } as const;
        const initial = [present, other];

        expect(updateManualFrequencyEntries(initial, absent, false)).toEqual([absent, other]);
        expect(updateManualFrequencyEntries(initial, present, true)).toEqual([other]);
        expect(initial).toEqual([present, other]);
    });
});
