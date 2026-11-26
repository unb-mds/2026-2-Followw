import { describe, expect, test } from 'bun:test';

import { parseSchedule } from '../../../src/lib/schedule.ts';
import {
    dayLanes,
    timelineHeight,
    timePosition,
    weeklyTimeline
} from '../../../src/lib/weekly-timeline.ts';

describe('escala semanal compartilhada', () => {
    test('mantém manhã, noite até 22h30 e sábado na mesma escala, sem encolher o meio', () => {
        const range = weeklyTimeline(parseSchedule('2M12 2N34 7N4'))!;
        expect(range).toEqual({ start: 480, end: 1380 });
        expect(timelineHeight(range)).toBe(720);
        expect(timePosition('22:30', range)).toBe(696);
        expect(timePosition('20:00', range) - timePosition('10:00', range)).toBe(480);
    });
    test('horários indefinidos não inventam blocos', () => {
        expect(weeklyTimeline(parseSchedule(null))).toBeNull();
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
