import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { STORAGE_KEYS, localStorageRepository } from '#/repositories/local-storage';

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

describe('localStorageRepository', () => {
    let memoryStorage: MemoryStorage;
    let originalWindow: typeof globalThis.window | undefined;

    beforeEach(() => {
        originalWindow = globalThis.window;
        memoryStorage = new MemoryStorage();

        const windowMock = {
            localStorage: memoryStorage
        };

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- mock de window para o ambiente de testes do Bun
        globalThis.window = windowMock as unknown as Window & typeof globalThis;
        globalThis.localStorage = memoryStorage;
    });

    afterEach(() => {
        if (originalWindow === undefined) {
            // @ts-expect-error restaurando estado original
            delete globalThis.window;
            // @ts-expect-error restaurando estado original
            delete globalThis.localStorage;
        } else {
            globalThis.window = originalWindow;
        }
    });

    test('armazena e recupera valores do tipo string', () => {
        localStorageRepository.set(STORAGE_KEYS.CARD_TOKEN, 'token-123456');
        const retrieved = localStorageRepository.get<string>(STORAGE_KEYS.CARD_TOKEN);

        expect(retrieved).toBe('token-123456');
        expect(memoryStorage.getItem('followw:card-token')).toBe('"token-123456"');
    });

    test('armazena e recupera valores do tipo número', () => {
        localStorageRepository.set(STORAGE_KEYS.BALANCE, 42.5);
        const retrieved = localStorageRepository.get<number>(STORAGE_KEYS.BALANCE);

        expect(retrieved).toBe(42.5);
        expect(memoryStorage.getItem('followw:balance')).toBe('42.5');
    });

    test('armazena e recupera objetos complexos', () => {
        const payload = { id: 1, active: true, items: ['a', 'b'] };
        localStorageRepository.set('user-data', payload);

        const retrieved = localStorageRepository.get<typeof payload>('user-data');
        expect(retrieved).toEqual(payload);
        expect(memoryStorage.getItem('followw:user-data')).toBe(JSON.stringify(payload));
    });

    test('retorna null para chaves inexistentes', () => {
        const result = localStorageRepository.get<string>('non-existent');
        expect(result).toBeNull();
    });

    test('remove um item armazenado via chave lógica', () => {
        localStorageRepository.set('temp', 'value');
        expect(localStorageRepository.get<string>('temp')).toBe('value');

        localStorageRepository.remove('temp');
        expect(localStorageRepository.get('temp')).toBeNull();
        expect(memoryStorage.getItem('followw:temp')).toBeNull();
    });

    test('clear remove apenas chaves com prefixo followw: mantendo dados de outras aplicações', () => {
        memoryStorage.setItem('other_app:session', 'abc');
        localStorageRepository.set('token', '123');
        localStorageRepository.set('balance', 10);

        expect(memoryStorage.getItem('other_app:session')).toBe('abc');
        expect(memoryStorage.getItem('followw:token')).toBe('"123"');

        localStorageRepository.clear();

        expect(localStorageRepository.get('token')).toBeNull();
        expect(localStorageRepository.get('balance')).toBeNull();
        expect(memoryStorage.getItem('other_app:session')).toBe('abc');
    });

    test('retorna null de forma segura ao ler JSON inválido', () => {
        memoryStorage.setItem('followw:corrupted', '{invalid_json');

        const result = localStorageRepository.get('corrupted');
        expect(result).toBeNull();
    });

    test('trata erros no set sem lançar exceções para objetos não serializáveis', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        expect(() => {
            localStorageRepository.set('circular', circular);
        }).not.toThrow();

        expect(localStorageRepository.get('circular')).toBeNull();
    });

    test('trata erros no set quando setItem lança exceção (ex: QuotaExceededError)', () => {
        memoryStorage.setItem = () => {
            throw new Error('QuotaExceededError');
        };

        expect(() => {
            localStorageRepository.set('key', 'value');
        }).not.toThrow();
    });

    test('funciona com resiliência se window ou localStorage estiver ausente ou indisponível', () => {
        // @ts-expect-error simulação de ambiente SSR sem window
        delete globalThis.window;
        // @ts-expect-error simulação de ambiente SSR sem localStorage
        delete globalThis.localStorage;

        expect(localStorageRepository.get('test')).toBeNull();
        expect(() => localStorageRepository.set('test', 123)).not.toThrow();
        expect(() => localStorageRepository.remove('test')).not.toThrow();
        expect(() => localStorageRepository.clear()).not.toThrow();
    });
});
