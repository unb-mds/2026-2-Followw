import { describe, expect, test } from 'bun:test';

import { coursePeriod } from '#/lib/profile';

describe('coursePeriod', () => {
    test('conta os semestres letivos desde o ingresso, incluindo o atual', () => {
        expect(coursePeriod('2026.2', '2026.2')).toBe(1);
        expect(coursePeriod('2024.1', '2026.2')).toBe(6);
        expect(coursePeriod('2023.2', '2026.1')).toBe(6);
    });

    test('o semestre de verão conta como o letivo anterior', () => {
        expect(coursePeriod('2024.1', '2026.4')).toBe(6);
    });

    test('não calcula sem ingresso, semestre atual ou com valores inválidos', () => {
        expect(coursePeriod(null, '2026.2')).toBeNull();
        expect(coursePeriod('2026.1', undefined)).toBeNull();
        expect(coursePeriod('2026', '2026.2')).toBeNull();
        expect(coursePeriod('2026.4', '2027.1')).toBeNull();
        expect(coursePeriod('2027.1', '2026.2')).toBeNull();
    });
});
