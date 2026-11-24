import type { Classroom } from '@followw/core/queries/classrooms.ts';

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ClassroomCard } from '#/components/classroom/ClassroomCard';

const classroom: Classroom = {
    id: '1',
    professors: [],
    number: '01',
    semester: '2026.2',
    current: true,
    subject: { name: 'Cálculo 1', code: 'MAT0025', hours: 60 },
    room: 'ICC'
};

const render = (changes: Partial<Classroom>) =>
    renderToStaticMarkup(<ClassroomCard classroom={{ ...classroom, ...changes }} />);

describe('ClassroomCard', () => {
    test('turma atual mostra o local e o horário a definir', () => {
        const markup = render({});

        expect(markup).toContain('ICC');
        expect(markup).toContain('Horário a definir');
    });

    test('turma atual sem local informa a ausência', () => {
        expect(render({ room: null })).toContain('Local não informado');
    });

    test('menção lançada substitui o local, mesmo na turma atual', () => {
        const markup = render({ grade: 'SS' });

        expect(markup).toContain('>SS</span>');
        expect(markup).not.toContain('ICC');
    });

    test('turma antiga não mostra local', () => {
        const markup = render({ current: false });

        expect(markup).not.toContain('ICC');
        expect(markup).not.toContain('Local não informado');
    });
});
