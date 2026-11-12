import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Lesson } from '#/queries/classrooms';

import { LessonCalendar, lessonsByDay } from '#/components/classroom/LessonCalendar';

const lesson = (occurred_on: string, status: Lesson['status'], start_time = '08:00'): Lesson => ({
    id: `${occurred_on}:${start_time}`,
    occurred_on,
    start_time,
    end_time: null,
    status,
    absences: 0,
    marked: false
});

// a lista vem da mais recente para a mais antiga
const lessons = [
    lesson('2026-10-09', 'cancelada'),
    lesson('2026-10-07', 'nao_registrada'),
    lesson('2026-10-05', 'falta', '10:00'),
    lesson('2026-10-05', 'presente')
];

describe('LessonCalendar', () => {
    test('agrupa as aulas por dia em ordem cronológica', () => {
        const days = lessonsByDay(lessons);
        expect([...days.keys()]).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
        expect(days.get('2026-10-05')!.map((item) => item.status)).toEqual(['presente', 'falta']);
    });

    test('marca cada aula com uma bolinha da cor da situação', () => {
        const markup = renderToStaticMarkup(<LessonCalendar lessons={lessons} />);
        const day = (iso: string) =>
            markup.match(new RegExp(`data-day="${iso}"[^>]*>(.*?)</td>`))![1];

        expect(day('2026-10-05')).toContain('bg-primary');
        expect(day('2026-10-05')).toContain('bg-destructive');
        expect(day('2026-10-07')).toContain('bg-muted-foreground/40');
        expect(day('2026-10-09')).toContain('line-through');
        expect(day('2026-10-09')).not.toContain('rounded-full');
        expect(markup).toContain('aria-label="5 de outubro: presença, falta"');
        expect(markup).toContain('outubro');
    });

    test('pinta de vermelho o número dos feriados', () => {
        const markup = renderToStaticMarkup(<LessonCalendar lessons={lessons} />);
        const cell = (iso: string) =>
            markup.match(new RegExp(`<td[^>]*data-day="${iso}"[^>]*>.*?</td>`))![0];

        expect(cell('2026-10-12')).toContain('text-destructive');
        expect(cell('2026-10-12')).toContain('12 de outubro, Nossa Senhora Aparecida');
        // ponto facultativo não é feriado
        expect(cell('2026-10-30')).not.toContain('text-destructive');
        expect(cell('2026-10-13')).not.toContain('text-destructive');
    });
});
