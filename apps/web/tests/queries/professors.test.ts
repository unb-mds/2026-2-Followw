import { describe, expect, test } from 'bun:test';

import { professorSearch } from '#/queries/professors';

describe('professorSearch', () => {
    test.each([
        ['Carlos Silva', 'Carlos Silva'],
        ['FGA0003', null],
        ['cic 4', null],
        ['', null],
        [undefined, null]
    ])('termo %p busca docentes como %p', (q, expected) => {
        expect(professorSearch(q)).toBe(expected);
    });
});
