import { describe, expect, test } from 'bun:test';

import { parseSchedule } from '#/lib/schedule';
import { dayLanes, timePosition, weeklyTimeline } from '#/lib/weekly-timeline';

describe('escala semanal compartilhada', () => {
    test('mantém manhã, noite até 22h30 e sábado, omitindo somente vazio comum', () => {
        const segments = weeklyTimeline(parseSchedule('2M12 2N34 7N4'));
        expect(segments.map(({ start, end, omitted }) => [start, end, omitted])).toEqual([
            [480, 600, false],
            [600, 1200, true],
            [1200, 1380, false]
        ]);
        expect(timePosition('22:30', segments)).toBe(216);
        expect(timePosition('20:50', segments)).toBe(136);
        expect(segments.find(({ omitted }) => omitted)?.height).toBe(0);
        expect(timePosition('10:00', segments)).toBe(timePosition('20:00', segments));
    });
    test('aula à tarde em outro dia impede compactação da faixa ocupada', () => {
        const segments = weeklyTimeline(parseSchedule('2M12 2N34 3T23'));
        expect(
            segments.filter(({ omitted }) => omitted).map(({ start, end }) => [start, end])
        ).toEqual([
            [600, 840],
            [960, 1200]
        ]);
        const afternoon = segments.find(
            ({ start, end, omitted }) => !omitted && start <= 840 && end >= 950
        );
        expect(afternoon).toBeDefined();
        expect(timePosition('15:50', segments) - timePosition('14:00', segments)).toBe(88);
    });
    test('intervalos pequenos mantêm a mesma escala e horários indefinidos não inventam blocos', () => {
        expect(weeklyTimeline(parseSchedule('2M1234')).some(({ omitted }) => omitted)).toBe(false);
        expect(weeklyTimeline(parseSchedule(null))).toEqual([]);
    });
    test('sobreposições reais permanecem visíveis em faixas paralelas', () => {
        const placed = dayLanes([
            { weekday: 1, start: '08:00', end: '09:50' },
            { weekday: 1, start: '08:55', end: '10:55' },
            { weekday: 1, start: '11:00', end: '11:50' }
        ]);
        expect(placed.map(({ lane, lanes }) => [lane, lanes])).toEqual([
            [0, 2],
            [1, 2],
            [0, 1]
        ]);
    });
});
