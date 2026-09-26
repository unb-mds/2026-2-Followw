import { describe, expect, test } from 'bun:test';

import {
    classesOn,
    describeSchedule,
    nextDays,
    nowInBrasilia,
    parseSchedule,
    weekDays
} from '#/lib/schedule.ts';

describe('parseSchedule', () => {
    test('expande dias e junta horários seguidos', () => {
        expect(parseSchedule('35T23')).toEqual([
            { weekday: 2, start: '14:00', end: '15:50' },
            { weekday: 4, start: '14:00', end: '15:50' }
        ]);
    });

    test('aceita mais de um bloco e ordena por dia', () => {
        expect(parseSchedule('4M12 2N34')).toEqual([
            { weekday: 1, start: '20:50', end: '22:30' },
            { weekday: 3, start: '08:00', end: '09:50' }
        ]);
    });

    test('junta blocos colados entre turnos', () => {
        expect(parseSchedule('35M5 35T1')).toEqual([
            { weekday: 2, start: '12:00', end: '13:50' },
            { weekday: 4, start: '12:00', end: '13:50' }
        ]);
        expect(parseSchedule('2M5 3T1')).toHaveLength(2);
    });

    test('ignora código vazio ou inválido', () => {
        expect(parseSchedule(null)).toEqual([]);
        expect(parseSchedule('99Z9')).toEqual([]);
    });
});

describe('describeSchedule', () => {
    test('agrupa os dias com o mesmo horário', () => {
        expect(describeSchedule('35M34')).toBe('Ter, Qui · 10:00–11:50');
        expect(describeSchedule('35M5 35T1')).toBe('Ter, Qui · 12:00–13:50');
    });

    test('devolve o código quando não entende', () => {
        expect(describeSchedule('A DEFINIR')).toBe('A DEFINIR');
        expect(describeSchedule(null)).toBeUndefined();
    });
});

describe('classesOn', () => {
    const turmas = [
        { name: 'Cálculo', schedule: '246M12' },
        { name: 'Software', schedule: '24T23' },
        { name: 'Física', schedule: '35N12' }
    ];

    test('filtra o dia e marca em andamento e próxima', () => {
        const aulas = classesOn(turmas, 1, '09:00');
        expect(aulas.map((a) => [a.item.name, a.status])).toEqual([
            ['Cálculo', 'in_progress'],
            ['Software', 'next']
        ]);
    });

    test('sem horário, nenhuma aula recebe status', () => {
        expect(classesOn(turmas, 5).map((a) => a.status)).toEqual(['normal']);
    });
});

test('nowInBrasilia usa o fuso de Brasília', () => {
    expect(nowInBrasilia(new Date('2026-09-27T02:30:00Z'))).toEqual({
        date: '2026-09-26',
        weekday: 6,
        time: '23:30'
    });
});

test('nextDays atravessa o fim do mês', () => {
    expect(nextDays('2026-09-29', 3)).toEqual([
        { date: '2026-09-29', weekday: 2 },
        { date: '2026-09-30', weekday: 3 },
        { date: '2026-10-01', weekday: 4 }
    ]);
});

const dates = (date: string) => weekDays(date).map((d) => d.date);

describe('weekDays', () => {
    test('vai de segunda a sábado da semana, atravessando o mês', () => {
        expect(dates('2026-09-30')).toEqual([
            '2026-09-28',
            '2026-09-29',
            '2026-09-30',
            '2026-10-01',
            '2026-10-02',
            '2026-10-03'
        ]);
        expect(weekDays('2026-09-26').map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test('no domingo, mostra a semana que começa', () => {
        expect(dates('2026-09-27')[0]).toBe('2026-09-28');
    });
});
