import { describe, expect, test } from 'bun:test';

import { isTheme, nextTheme } from '../../src/lib/theme.ts';

describe('nextTheme', () => {
    test.each([
        ['system', 'light'],
        ['light', 'dark'],
        ['dark', 'system']
    ] as const)('%s → %s', (theme, expected) => {
        expect(nextTheme(theme)).toBe(expected);
    });
});

describe('isTheme', () => {
    test('aceita só os temas conhecidos', () => {
        expect(isTheme('dark')).toBe(true);
        expect(isTheme('sepia')).toBe(false);
        expect(isTheme(null)).toBe(false);
    });
});
