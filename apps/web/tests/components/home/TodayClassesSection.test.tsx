import { describe, expect, test } from 'bun:test';

import type { WeekLesson } from '#/queries/lessons';

import { TodayClassesSection } from '#/components/home/TodayClassesSection';
import { lessonsOn } from '#/lib/schedule';

import { renderWithRouter } from '../../helpers/router';

const lesson = (id: string, start: string, end: string, status: WeekLesson['status']) =>
    ({
        id,
        start_time: `${start}:00`,
        end_time: `${end}:00`,
        status,
        marked: false,
        scheduled: true,
        classroom: {
            id: `turma-${id}`,
            subject: { code: id, name: `Disciplina ${id}` },
            room: 'S9'
        }
    }) satisfies WeekLesson;

const now = { date: '2026-09-17', weekday: 4, time: '15:00' };

function render(lessons: WeekLesson[], noClassReason?: string) {
    return renderWithRouter(
        <TodayClassesSection
            loggedIn
            noClassReason={noClassReason}
            isLoadingError={false}
            onRetry={() => {}}
            classes={lessonsOn(lessons, now.weekday, now.time)}
            date={now.date}
            now={now}
        />
    );
}

const bars = (markup: string) =>
    [...markup.matchAll(/class="([^"]*rounded-full[^"]*)" style="height:([\d.]+)%"/g)].map(
        ([, classes, height]) => [classes.includes('bg-destructive') ? 'falta' : 'ok', height]
    );

describe('TodayClassesSection', () => {
    test('a barra enche com o tempo e fica vermelha na aula com falta', () => {
        const markup = render([
            lesson('A', '08:00', '09:50', 'falta'),
            lesson('B', '14:00', '16:00', 'nao_registrada'),
            lesson('C', '16:00', '17:50', 'presente')
        ]);
        expect(bars(markup)).toEqual([
            ['falta', '100'],
            ['ok', '50'],
            ['ok', '0']
        ]);
    });

    test('aula cancelada fica riscada, com a barra vazia e sem virar a em andamento', () => {
        const markup = render([
            lesson('A', '14:00', '16:00', 'cancelada'),
            lesson('B', '16:00', '17:50', null)
        ]);
        expect(markup).toContain('line-through');
        expect(markup).toContain('Cancelada');
        expect(markup).not.toContain('Em andamento');
        expect(markup).toContain('Próxima');
        expect(bars(markup)[0]).toEqual(['ok', '0']);
    });

    test('dia sem aulas mostra o motivo vindo da semana', () => {
        const markup = render([], 'Semana Universitária 2026');
        expect(markup).toContain('Não há aulas hoje');
        expect(markup).toContain('Semana Universitária 2026');
    });
});
