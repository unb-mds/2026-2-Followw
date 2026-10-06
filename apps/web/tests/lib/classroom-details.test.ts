import { describe, expect, test } from 'bun:test';

import type { components } from '#/queries/schema.gen';

import { formatClassroomDate, groupBySemester, groupMembers } from '#/lib/classroom-details';

type Member = components['schemas']['ClassroomMember'];

describe('detalhes da turma', () => {
    test('separa professores, monitores e estudantes sem perder a ordem', () => {
        const members: Member[] = [
            { name: 'Aluno A', role: 'aluno' },
            { name: 'Professora', role: 'professor' },
            { name: 'Monitor', role: 'monitor' },
            { name: 'Aluno B', role: 'aluno' }
        ];

        const groups = groupMembers(members);

        expect(groups.professors.map((member) => member.name)).toEqual(['Professora']);
        expect(groups.monitors.map((member) => member.name)).toEqual(['Monitor']);
        expect(groups.students.map((member) => member.name)).toEqual(['Aluno A', 'Aluno B']);
    });

    test('formata datas do SIGAA sem deslocamento de fuso horário', () => {
        expect(formatClassroomDate('2026-09-28')).toBe('28/09/2026');
    });

    test('agrupa turmas por semestre, do mais recente ao mais antigo', () => {
        const classrooms = [
            { id: 'a', semester: '2025.2' },
            { id: 'b', semester: '2026.1' },
            { id: 'c', semester: '2025.2' }
        ];

        expect(groupBySemester(classrooms)).toEqual([
            ['2026.1', [{ id: 'b', semester: '2026.1' }]],
            [
                '2025.2',
                [
                    { id: 'a', semester: '2025.2' },
                    { id: 'c', semester: '2025.2' }
                ]
            ]
        ]);
    });
});
