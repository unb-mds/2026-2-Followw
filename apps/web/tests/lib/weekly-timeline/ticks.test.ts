import { describe, expect, test } from 'bun:test';

import { parseSchedule } from '#/lib/schedule';
import { timePosition, timeTicks, weeklyTimeline } from '#/lib/weekly-timeline';

describe('marcadores de horário da grade semanal', () => {
    test('termina em hora cheia com espaçamento uniforme sem apertar o fim da aula', () => {
        const timeline = weeklyTimeline(parseSchedule('2T23'));
        expect(timeTicks(timeline)).toEqual([
            { minute: 840, top: 0 },
            { minute: 900, top: 48 },
            { minute: 960, top: 96 }
        ]);
        expect(timePosition('15:50', timeline)).toBe(88);
    });

    test('alinha início fracionado e término noturno mantendo os horários reais das aulas', () => {
        const timeline = weeklyTimeline(parseSchedule('2N34'));
        expect(timeTicks(timeline)).toEqual([
            { minute: 1200, top: 0 },
            { minute: 1260, top: 48 },
            { minute: 1320, top: 96 },
            { minute: 1380, top: 144 }
        ]);
        expect(timePosition('20:50', timeline)).toBe(40);
        expect(timePosition('22:30', timeline)).toBe(120);
    });

    test('não sobrepõe marcadores na junção dos intervalos omitidos', () => {
        const ticks = timeTicks(weeklyTimeline(parseSchedule('2M12 2N34')));
        expect(ticks.map(({ minute }) => minute)).toEqual([480, 540, 1200, 1260, 1320, 1380]);
        for (let index = 1; index < ticks.length; index++)
            expect(ticks[index].top - ticks[index - 1].top).toBe(48);
    });

    test('não cria marcadores sem aulas', () => {
        expect(timeTicks(weeklyTimeline([]))).toEqual([]);
    });
});
