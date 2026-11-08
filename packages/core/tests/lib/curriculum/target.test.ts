import { describe, expect, test } from 'bun:test';

import { flowTarget } from '../../../src/lib/curriculum/target.ts';

const user = { course: { id: 7, name: 'Computação', shift: null }, entry_semester: '2020.1' };

describe('flowTarget', () => {
    test('curso do aluno usa o ingresso dele', () => {
        const target = flowTarget(user, 7);
        expect(target).toMatchObject({ ownCourse: true, loggedIn: true, entrySemester: '2020.1' });
    });

    test('outro curso usa o semestre atual e não calcula período', () => {
        const target = flowTarget(user, 8);
        expect(target.ownCourse).toBe(false);
        expect(target.currentPeriod).toBeNull();
    });

    test('visitante não tem curso próprio', () => {
        expect(flowTarget(null, 7)).toMatchObject({ ownCourse: false, loggedIn: false });
    });
});
