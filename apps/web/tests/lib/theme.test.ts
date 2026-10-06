import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
    isDarkTheme,
    isTheme,
    nextTheme,
    readTheme,
    saveTheme,
    subscribeTheme,
    themeScript
} from '#/lib/theme';

describe('nextTheme', () => {
    test.each([
        ['system', 'light'],
        ['light', 'dark'],
        ['dark', 'system']
    ] as const)('%s → %s', (theme, expected) => {
        expect(nextTheme(theme)).toBe(expected);
    });
});

describe('isDarkTheme', () => {
    test.each([
        ['system', true, true],
        ['system', false, false],
        ['light', true, false],
        ['dark', false, true]
    ] as const)('%s com sistema escuro=%s → %s', (theme, systemDark, expected) => {
        expect(isDarkTheme(theme, systemDark)).toBe(expected);
    });
});

describe('isTheme', () => {
    test('aceita só os temas conhecidos', () => {
        expect(isTheme('dark')).toBe(true);
        expect(isTheme('sepia')).toBe(false);
        expect(isTheme(null)).toBe(false);
    });
});

describe('preferência salva', () => {
    let originalWindow: typeof globalThis.window | undefined;
    const store = new Map<string, string>();

    beforeEach(() => {
        originalWindow = globalThis.window;
        store.clear();
        Object.defineProperty(globalThis, 'window', {
            value: {
                localStorage: {
                    getItem: (key: string) => store.get(key) ?? null,
                    setItem: (key: string, value: string) => store.set(key, value),
                    removeItem: (key: string) => store.delete(key)
                }
            },
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
        else
            Object.defineProperty(globalThis, 'window', {
                value: originalWindow,
                writable: true,
                configurable: true
            });
    });

    test('padrão é system', () => {
        expect(readTheme()).toBe('system');
    });

    test('salva e lê a preferência na chave lida pelo script do head', () => {
        saveTheme('dark');
        expect(store.get('followw:theme')).toBe('"dark"');
        expect(themeScript).toContain("'followw:theme'");
        expect(readTheme()).toBe('dark');
    });

    test('avisa os inscritos quando a preferência muda', () => {
        let calls = 0;
        const unsubscribe = subscribeTheme(() => calls++);
        saveTheme('dark');
        unsubscribe();
        saveTheme('light');
        expect(calls).toBe(1);
    });

    test('system remove a preferência e valores inválidos voltam para system', () => {
        saveTheme('light');
        saveTheme('system');
        expect(store.has('followw:theme')).toBe(false);

        store.set('followw:theme', '"sepia"');
        expect(readTheme()).toBe('system');
    });
});
