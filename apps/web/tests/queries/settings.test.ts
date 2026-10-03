import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { localStorageRepository, STORAGE_KEYS } from '#/lib/local-storage';
import { getStoredSettings, settingsQueryOptions, type UserSettings } from '#/queries/settings';

class MemoryStorage implements Storage {
    private store = new Map<string, string>();

    get length(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
    }

    getItem(key: string): string | null {
        return this.store.get(key) ?? null;
    }

    key(index: number): string | null {
        return Array.from(this.store.keys())[index] ?? null;
    }

    removeItem(key: string): void {
        this.store.delete(key);
    }

    setItem(key: string, value: string): void {
        this.store.set(key, value);
    }
}

describe('configurações do usuário (settings)', () => {
    let memoryStorage: MemoryStorage;
    let originalWindow: typeof globalThis.window | undefined;

    beforeEach(() => {
        originalWindow = globalThis.window;
        memoryStorage = new MemoryStorage();

        Object.defineProperty(globalThis, 'window', {
            value: { localStorage: memoryStorage },
            writable: true,
            configurable: true
        });
        Object.defineProperty(globalThis, 'localStorage', {
            value: memoryStorage,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        if (originalWindow === undefined) {
            Reflect.deleteProperty(globalThis, 'window');
            Reflect.deleteProperty(globalThis, 'localStorage');
        } else {
            Object.defineProperty(globalThis, 'window', {
                value: originalWindow,
                writable: true,
                configurable: true
            });
        }
    });

    test('getStoredSettings lê exclusivamente do localStorage com fallback para vazio', () => {
        expect(getStoredSettings()).toEqual({});

        const saved: UserSettings = {
            displayName: 'Mendez',
            defaultRuCampus: 'Darcy',
            defaultRuMeal: 'lunch',
            hideRuBalance: true,
            scheduleView: 'week',
            compactMode: false,
            theme: 'dark'
        };
        localStorageRepository.set(STORAGE_KEYS.SETTINGS, saved);

        expect(getStoredSettings()).toEqual(saved);
    });

    test('sincronização do banco substitui o estado do localStorage', () => {
        const local: UserSettings = { displayName: 'Local Antigo', defaultRuCampus: 'Gama' };
        localStorageRepository.set(STORAGE_KEYS.SETTINGS, local);
        expect(getStoredSettings()).toEqual(local);

        const doBanco: UserSettings = {
            displayName: 'Atualizado no Banco',
            defaultRuCampus: 'Darcy',
            defaultRuMeal: 'dinner',
            theme: 'system'
        };
        localStorageRepository.set(STORAGE_KEYS.SETTINGS, doBanco);

        expect(getStoredSettings()).toEqual(doBanco);
    });

    test('settingsQueryOptions possui queryKey correta', () => {
        expect(settingsQueryOptions.queryKey).toBeDefined();
    });
});
