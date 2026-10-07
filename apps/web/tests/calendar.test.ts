import { describe, expect, test } from 'bun:test';

import { getNoClassEvents, getNoClassReason } from '#/calendar';

describe('getNoClassEvents', () => {
    test('inclui todos os dias da Semana Universitária', () => {
        expect(getNoClassEvents('2026-09-20').map((event) => event.id)).toEqual([
            'university_week'
        ]);
        expect(getNoClassEvents('2026-09-22').map((event) => event.id)).toEqual([
            'university_week'
        ]);
        expect(getNoClassEvents('2026-09-25').map((event) => event.id)).toEqual([
            'university_week'
        ]);
        expect(getNoClassEvents('2026-09-26')).toEqual([]);
    });

    test('inclui feriados e pontos facultativos', () => {
        expect(getNoClassEvents('2026-10-12').map((event) => event.id)).toEqual([
            'our_lady_aparecida'
        ]);
        expect(getNoClassEvents('2026-10-28').map((event) => event.id)).toEqual([
            'public_servant_day'
        ]);
    });

    test('ignora eventos acadêmicos e datas sem evento', () => {
        expect(getNoClassEvents('2026-10-09')).toEqual([]);
        expect(getNoClassEvents('2030-10-12')).toEqual([]);
    });
});

describe('getNoClassReason', () => {
    test('usa o nome do evento como motivo', () => {
        expect(getNoClassReason('2026-09-22')).toBe('Semana Universitária 2026');
        expect(getNoClassReason('2026-10-28')).toBe('Dia do Servidor Público');
    });

    test('sinaliza datas fora do período de aulas do semestre', () => {
        expect(getNoClassReason('2026-08-09')).toBe('Fora do período de aulas');
        expect(getNoClassReason('2026-08-10')).toBeUndefined();
        expect(getNoClassReason('2026-12-15')).toBe('Fora do período de aulas');
    });

    test('mantém a grade quando a data não consta em um semestre', () => {
        expect(getNoClassReason('2028-02-23')).toBeUndefined();
    });
});
