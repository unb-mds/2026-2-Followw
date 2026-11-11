import { describe, expect, test } from 'bun:test';

import { classProgress, dayTimeline } from '#/lib/day-timeline';
import { classesOn, nowInBrasilia } from '#/lib/schedule';

const date = '2026-11-10';
const now = (time: string) => ({ date, weekday: 2, time });

describe('trilha das aulas', () => {
    test.each([
        ['07:00', 0],
        ['08:00', 0],
        ['08:55', 0.5],
        ['09:50', 1],
        ['23:00', 1]
    ] as const)('calcula progresso limitado com relógio controlado às %s', (time, value) => {
        expect(classProgress('08:00', '09:50', date, now(time))).toBe(value);
    });
    test('datas anteriores estão completas e futuras sem progresso', () => {
        expect(classProgress('19:00', '22:30', '2026-11-09', now('08:00'))).toBe(1);
        expect(classProgress('08:00', '09:50', '2026-11-11', now('23:00'))).toBe(0);
    });
    test('mostra somente intervalos maiores que dez minutos entre as trilhas independentes', () => {
        const classes = classesOn(
            [{ schedule: '3M12' }, { schedule: '3M34' }, { schedule: '3N34' }],
            2
        );
        const timeline = dayTimeline(classes, date, now('09:55'));
        expect(timeline.slice(0, 2).map(({ gap }) => gap)).toEqual([0, 0]);
        expect(timeline.every(({ active }) => !active)).toBe(true);
        expect(timeline.map(({ progress }) => progress)).toEqual([1, 0, 0]);
        expect(timeline[2].gap).toBeGreaterThan(10);
    });
    test('sobreposições têm trilhas independentes e fim do dia completa todas', () => {
        const classes = classesOn(
            [{ schedule: '3M12' }, { schedule: '3M2' }, { schedule: '3N4' }],
            2
        );
        const timeline = dayTimeline(classes, date, now('23:00'));
        expect(timeline[1].overlap).toBe(true);
        expect(timeline.every(({ progress, active }) => progress === 1 && !active)).toBe(true);
    });
    test('recalcula o progresso após suspensão sem reproduzir tempo perdido', () => {
        const classes = classesOn([{ schedule: '3N1234' }], 2);
        const before = nowInBrasilia(new Date('2026-11-10T22:00:00Z'));
        const resumed = nowInBrasilia(new Date('2026-11-11T01:30:00Z'));
        expect(dayTimeline(classes, date, before)[0].progress).toBe(0);
        expect(dayTimeline(classes, date, resumed)[0]).toMatchObject({
            progress: 1,
            active: false
        });
    });
});
