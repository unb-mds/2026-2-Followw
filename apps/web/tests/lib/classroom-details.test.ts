import { describe, expect, test } from 'bun:test';

import {
    daysFrom,
    formatClassroomDate,
    formatClassroomDateTime,
    formatClassroomWeekday,
    formatRelativeDay,
    formatRelativeDays,
    frequencyTone,
    groupBySemester
} from '#/lib/classroom-details';

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
