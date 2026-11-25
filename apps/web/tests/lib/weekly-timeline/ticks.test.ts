import { parseSchedule } from '@followw/core/lib/schedule.ts';
import { describe, expect, test } from 'bun:test';

import { timePosition, timeTicks, weeklyTimeline } from '#/lib/weekly-timeline';

describe('marcadores de horário da grade semanal', () => {
    test('termina em hora cheia com espaçamento uniforme sem apertar o fim da aula', () => {
        const timeline = weeklyTimeline(parseSchedule('2T23'))!;
        expect(timeTicks(timeline)).toEqual([
            { minute: 840, top: 0 },
            { minute: 900, top: 48 },
            { minute: 960, top: 96 }
        ]);
        expect(timePosition('15:50', timeline)).toBe(88);
    });

    test('alinha início fracionado e término noturno mantendo os horários reais das aulas', () => {
        const timeline = weeklyTimeline(parseSchedule('2N34'))!;
        expect(timeTicks(timeline)).toEqual([
            { minute: 1200, top: 0 },
            { minute: 1260, top: 48 },
            { minute: 1320, top: 96 },
            { minute: 1380, top: 144 }
        ]);
        expect(timePosition('20:50', timeline)).toBe(40);
        expect(timePosition('22:30', timeline)).toBe(120);
    });

    test('marca todas as horas entre a primeira e a última aula', () => {
        const ticks = timeTicks(weeklyTimeline(parseSchedule('2M12 2N34')));
        expect(ticks.map(({ minute }) => minute)).toEqual(
            Array.from({ length: 16 }, (_, index) => 480 + index * 60)
        );
        expect(ticks.at(-1)?.top).toBe(720);
    });

    test('não cria marcadores sem aulas', () => {
        expect(timeTicks(weeklyTimeline([]))).toEqual([]);
    });
});
