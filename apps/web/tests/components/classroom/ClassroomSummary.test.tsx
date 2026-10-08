import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Classroom } from '#/queries/classrooms';

import { ClassroomSummary } from '#/components/classroom/ClassroomSummary';

const classroom: Classroom = {
    id: '1',
    number: '01',
    semester: '2026.1',
    current: false,
    subject: { name: 'Cálculo 1', code: 'MAT0025', hours: 60 },
    grade: 'SS'
};

describe('ClassroomSummary', () => {
    test('substitui o local pela menção nas turmas antigas', () => {
        const markup = renderToStaticMarkup(
            <ClassroomSummary classroom={{ ...classroom, room: 'ICC' }} />
        );

        expect(markup).toContain('>SS</span>');
        expect(markup).toContain('text-info');
        expect(markup).not.toContain('ICC');
        expect(markup).not.toContain('lucide-map-pin');
        expect(markup).not.toContain('Local não informado');
    });

    test.each([null, undefined])('informa quando a menção não está disponível: %s', (grade) => {
        const markup = renderToStaticMarkup(
            <ClassroomSummary classroom={{ ...classroom, grade }} />
        );

        expect(markup).toContain('Menção não disponível');
        expect(markup).not.toContain('Local não informado');
    });

    test.each(['ICC', null])('mantém o local nas turmas atuais: %s', (room) => {
        const markup = renderToStaticMarkup(
            <ClassroomSummary classroom={{ ...classroom, current: true, room }} />
        );

        expect(markup).toContain(room ?? 'Local não informado');
        expect(markup).toContain('lucide-map-pin');
        expect(markup).not.toContain('>SS</span>');
    });
});
