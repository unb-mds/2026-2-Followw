import { describe, expect, test } from 'bun:test';

import { academicCalendar, getSemester, listSemesters } from './calendar';

describe('academicCalendar', () => {
    test('contains 2026 and 2027', () => {
        expect(academicCalendar.years['2026']).toBeDefined();
        expect(academicCalendar.years['2027']).toBeDefined();
    });

    test('getSemester retrieves 2026.1 and 2027.1', () => {
        const sem2026 = getSemester('2026.1');
        expect(sem2026).toBeDefined();
        expect(sem2026?.classes.start).toBe('2026-03-16');
        expect(sem2026?.classes.end).toBe('2026-07-18');
        expect(sem2026?.classes.instructional_days).toBe(100);

        const sem2027 = getSemester('2027.1');
        expect(sem2027).toBeDefined();
        expect(sem2027?.classes.start).toBe('2027-03-15');
        expect(sem2027?.classes.end).toBe('2027-07-16');
    });

    test('listSemesters returns all semesters', () => {
        const semesters = listSemesters();
        const ids = semesters.map((s) => s.semester);
        expect(ids).toContain('2026.1');
        expect(ids).toContain('2026.2');
        expect(ids).toContain('2026.4');
        expect(ids).toContain('2027.1');
        expect(ids).toContain('2027.2');
        expect(ids).toContain('2027.4');
    });
});
