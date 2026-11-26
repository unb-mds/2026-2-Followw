import { expect, test } from 'bun:test';

import { disciplinesBySemester } from '../../src/queries/professors.ts';

const discipline = (semester: string, code: string) => ({
    semester,
    code,
    occurrences: 1,
    name: null
});

test('agrupa do semestre mais recente, cada um em ordem de código', () => {
    const groups = disciplinesBySemester([
        discipline('2025.1', 'MAT0025'),
        discipline('2026.1', 'FGA0170'),
        discipline('2025.1', 'CIC0004')
    ]);
    expect(groups.map(({ semester, items }) => [semester, items.map(({ code }) => code)])).toEqual([
        ['2026.1', ['FGA0170']],
        ['2025.1', ['CIC0004', 'MAT0025']]
    ]);
});
