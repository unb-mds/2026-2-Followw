import { expect, test } from 'bun:test';

import type { SemesterCalendar } from '../../src/calendar.ts';
import type { Classroom } from '../../src/queries/classrooms.ts';

import { semesterProgress } from '../../src/lib/semester-dates.ts';
import { countsInSemester, isEnrolled } from '../../src/queries/classrooms.ts';

const semester: SemesterCalendar = {
    semester: '2026.2',
    name: '2º semestre de 2026',
    period: { start: '2026-08-01', end: '2026-09-30' },
    classes: { start: '2026-08-03', end: '2026-08-30', instructional_days: 20 },
    events: []
};
const classroom: Classroom = {
    id: '1',
    sigaa_id: 1,
    number: '1',
    semester: '2026.2',
    current: true,
    subject: { code: 'CIC0001', name: 'Disciplina' },
    professors: []
};

test.each([
    ['2026-07-30', 0, 'Aulas começam em 03/08'],
    ['2026-08-03', 0, 'Semana 1 de 4 · 27 dias até o fim das aulas'],
    ['2026-08-29', 96, 'Semana 4 de 4 · 1 dia até o fim das aulas'],
    ['2026-08-30', 100, 'Semana 4 de 4 · Último dia de aulas'],
    ['2026-09-02', 100, 'Período de aulas encerrado']
])('progresso do semestre em %s', (today, percent, status) => {
    expect(semesterProgress(semester, today)).toEqual({ percent, status });
});

test.each([
    [{ status: 'trancado' }, false, false],
    [{ status: 'denied' }, false, false],
    [{ status: 'pending_enrollment' }, true, false],
    [{ status: 'cursando', sigaa_id: null }, true, false],
    [{ status: 'cursando' }, true, true]
] satisfies [Partial<Classroom>, boolean, boolean][])(
    'turma %o conta no semestre e tem matrícula efetivada',
    (fields, counts, enrolled) => {
        expect(countsInSemester({ ...classroom, ...fields })).toBe(counts);
        expect(isEnrolled({ ...classroom, ...fields })).toBe(enrolled);
    }
);
