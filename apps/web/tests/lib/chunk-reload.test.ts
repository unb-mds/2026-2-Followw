import { describe, expect, test } from 'bun:test';

import { reloadOnPreloadError } from '#/lib/chunk-reload';

function setup(stored?: string) {
    const listeners = new Map<string, (event: Event) => void>();
    let reloads = 0;
    const target = {
        addEventListener: (type: string, fn: (event: Event) => void) => listeners.set(type, fn),
        removeEventListener: (type: string) => listeners.delete(type),
        location: { reload: () => (reloads += 1) }
    };
    const data = new Map<string, string>(stored ? [['followw:chunk-reload', stored]] : []);
    const storage = {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value)
    };
    const fire = () => {
        const event = new Event('vite:preloadError', { cancelable: true });
        listeners.get('vite:preloadError')?.(event);
        return event.defaultPrevented;
    };
    return { target, storage, listeners, fire, reloads: () => reloads };
}

describe('recarga por chunk ausente', () => {
    test('recarrega a página ao falhar o carregamento de um chunk', () => {
        const { target, storage, fire, reloads } = setup();
        reloadOnPreloadError(target, storage);

        expect(fire()).toBe(true);
        expect(reloads()).toBe(1);
    });

    test('não recarrega de novo logo após uma recarga', () => {
        const { target, storage, fire, reloads } = setup(String(Date.now()));
        reloadOnPreloadError(target, storage);

        expect(fire()).toBe(false);
        expect(reloads()).toBe(0);
    });

    test('a função devolvida remove o listener', () => {
        const { target, storage, listeners } = setup();
        reloadOnPreloadError(target, storage)();

        expect(listeners.size).toBe(0);
    });
});
