import { describe, expect, test } from 'bun:test';

import type { Lesson } from '../../src/queries/classrooms.ts';

import {
    classroomTab,
    daysFrom,
    formatClassroomDate,
    formatClassroomDateTime,
    formatClassroomWeekday,
    formatRelativeDay,
    formatRelativeDays,
    frequencyTone,
    groupBySemester,
    isLessonMarkable,
    isLessonSelectable,
    lessonRuns,
    lessonsByDay
} from '../../src/lib/classroom-details.ts';

describe('detalhes da turma', () => {
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

describe('formatClassroomWeekday', () => {
    test('abrevia o dia da semana sem ponto', () => {
        expect(formatClassroomWeekday('2026-10-07')).toBe('qua');
        expect(formatClassroomWeekday('2026-10-10T12:00:00')).toBe('sáb');
    });
});

describe('daysFrom', () => {
    test('conta os dias desde hoje, ignorando o horário', () => {
        expect(daysFrom('2026-10-09', '2026-10-09')).toBe(0);
        expect(daysFrom('2026-10-09', '2026-10-08T12:00:00')).toBe(-1);
        expect(daysFrom('2026-10-09', '2026-10-12')).toBe(3);
    });
});

describe('formatClassroomDateTime', () => {
    test('escreve data e hora', () => {
        expect(formatClassroomDateTime('2026-09-24T10:30:00')).toBe('24/09/2026 10:30');
    });
});

describe('formatRelativeDays', () => {
    test('escreve o dia relativo em minúsculas', () => {
        expect(formatRelativeDays(-20)).toBe('há 20 dias');
        expect(formatRelativeDays(-1)).toBe('ontem');
    });

    test('segue o Intl.RelativeTimeFormat do pt-BR sem depender dele', () => {
        const intl = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
        for (const days of [-30, -3, -2, -1, 0, 1, 2, 3, 15]) {
            expect(formatRelativeDays(days)).toBe(intl.format(days, 'day'));
        }
    });
});

describe('formatRelativeDay', () => {
    test('escreve o dia relativo com inicial maiúscula', () => {
        expect(formatRelativeDay(0)).toBe('Hoje');
        expect(formatRelativeDay(-1)).toBe('Ontem');
    });
});

describe('frequencyTone', () => {
    test('alerta até 80% e reprova abaixo de 75%', () => {
        expect(frequencyTone(100)).toBe('ok');
        expect(frequencyTone(80.1)).toBe('ok');
        expect(frequencyTone(80)).toBe('warning');
        expect(frequencyTone(75)).toBe('warning');
        expect(frequencyTone(74.9)).toBe('danger');
    });
});

const lesson = (
    occurred_on: string,
    status: Lesson['status'],
    fields: Partial<Lesson> = {}
): Lesson => ({
    id: occurred_on,
    occurred_on,
    status,
    start_time: null,
    end_time: null,
    absences: 0,
    marked: false,
    ...fields
});

describe('lessonRuns', () => {
    test('agrupa as aulas em sequências cronológicas, sem as canceladas', () => {
        expect(
            lessonRuns([
                lesson('2026-10-09', 'presente'),
                lesson('2026-10-08', 'falta'),
                lesson('2026-10-07', 'cancelada'),
                lesson('2026-10-06', 'falta'),
                lesson('2026-10-05', 'presente'),
                lesson('2026-10-04', 'presente')
            ])
        ).toMatchObject([
            { status: 'presente', count: 2 },
            { status: 'falta', count: 2 },
            { status: 'presente', count: 1 }
        ]);
    });

    test('conta as aulas duplas como duas horas-aula nas sequências', () => {
        const dupla = { start_time: '14:00:00', end_time: '15:50:00' };
        expect(
            lessonRuns([
                lesson('2026-10-07', 'falta', { absences: 2, ...dupla }),
                lesson('2026-10-06', 'presente', dupla),
                lesson('2026-10-05', 'presente', { start_time: '08:00', end_time: '08:55' })
            ])
        ).toMatchObject([
            { status: 'presente', count: 3 },
            { status: 'falta', count: 2 }
        ]);
    });
});

describe('classroomTab', () => {
    test('turma em andamento abre frequência e encerrada abre estatísticas', () => {
        expect(classroomTab('statistics', true)).toBe('frequency');
        expect(classroomTab('frequency', false)).toBe('statistics');
        expect(classroomTab('posts', false)).toBe('posts');
    });
});

describe('lessonsByDay', () => {
    test('agrupa as aulas por dia em ordem cronológica', () => {
        const days = lessonsByDay([
            { ...lesson('2026-10-09', 'cancelada'), id: 'c' },
            { ...lesson('2026-10-07', 'nao_registrada'), id: 'n' },
            { ...lesson('2026-10-05', 'falta'), id: 'f' },
            { ...lesson('2026-10-05', 'presente'), id: 'p' }
        ]);
        expect([...days.keys()]).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
        expect(days.get('2026-10-05')!.map((item) => item.status)).toEqual(['presente', 'falta']);
    });
});

describe('marcação de aulas pelo aluno', () => {
    test('só aula sem chamada e ainda não marcada pode ser selecionada', () => {
        expect(isLessonSelectable(lesson('2026-03-02', 'nao_registrada'))).toBe(true);
        expect(isLessonSelectable(lesson('2026-03-02', 'presente'))).toBe(false);
        expect(isLessonSelectable(lesson('2026-03-02', 'nao_registrada', { marked: true }))).toBe(
            false
        );
    });

    test('aula já marcada pelo aluno continua editável', () => {
        expect(isLessonMarkable(lesson('2026-03-02', 'presente', { marked: true }))).toBe(true);
        expect(isLessonMarkable(lesson('2026-03-02', 'falta'))).toBe(false);
    });
});
