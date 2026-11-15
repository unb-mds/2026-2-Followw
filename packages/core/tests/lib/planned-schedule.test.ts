import { expect, test } from 'bun:test';

import type { PlannedClass } from '../../src/lib/planned-schedule.ts';

import { addError, weeklyGrid } from '../../src/lib/planned-schedule.ts';

const classroom: PlannedClass = {
    code: 'MAT0025',
    name: 'Cálculo 1',
    hours: 90,
    number: '01',
    semester: '2026.2',
    schedule: '24M12',
    professors: []
};

test('grade compartilhada impede matéria repetida e choques no mesmo semestre', () => {
    expect(addError([classroom], classroom, null)).toContain('já está na grade');
    expect(addError([classroom], { ...classroom, code: 'MAT0026' }, null)).toContain('conflita');
    expect(addError([classroom], { ...classroom, semester: '2027.1' }, null)).toBeNull();
});

test('grade compartilhada respeita a carga máxima do semestre', () => {
    expect(addError([], classroom, 60)).toContain('ultrapassa');
    expect(addError([], classroom, 90)).toBeNull();
});

test('monta a grade sem depender do armazenamento do navegador', () => {
    const [semester] = weeklyGrid([
        classroom,
        { ...classroom, code: 'MAT0026', schedule: '', hours: null }
    ]);
    expect(semester.semester).toBe('2026.2');
    expect(semester.hours).toBe(90);
    expect(semester.rows.length).toBeGreaterThan(0);
    expect(semester.rows.some((row) => row.cells.includes(classroom))).toBe(true);
    expect(semester.unscheduled.map((item) => item.code)).toEqual(['MAT0026']);
});
