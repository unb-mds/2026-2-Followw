const STORAGE_PREFIX = 'followw:';

export const STORAGE_KEYS = {
    CARD_TOKEN: 'ru-token',
    BALANCE: 'ru_balance'
} as const;

function getStorage(): Storage | null {
    if (typeof window === 'undefined') {
        return null;
    }
    try {
        return window.localStorage ?? null;
    } catch {
        return null;
    }
}

function formatKey(key: string): string {
    return `${STORAGE_PREFIX}${key}`;
}

export interface LocalStorageRepository {
    get<T = unknown>(key: string, fallback?: T): T | null;
    set(key: string, value: unknown): void;
    remove(key: string): void;
    clear(): void;
}

export const localStorageRepository: LocalStorageRepository = {
    get<T = unknown>(key: string, fallback?: T): T | null {
        const storage = getStorage();
        if (!storage) {
            return fallback ?? null;
        }

        try {
            const item = storage.getItem(formatKey(key));
            if (item === null) {
                return fallback ?? null;
            }
            const parsed: T = JSON.parse(item);
            return parsed;
        } catch {
            return fallback ?? null;
        }
    },

    set(key: string, value: unknown): void {
        const storage = getStorage();
        if (!storage) {
            return;
        }

        try {
            const serialized = JSON.stringify(value);
            storage.setItem(formatKey(key), serialized);
        } catch {
            // Ignora falhas de serialização ou escrita no storage
        }
    },

    remove(key: string): void {
        const storage = getStorage();
        if (!storage) {
            return;
        }

        try {
            storage.removeItem(formatKey(key));
        } catch {
            // Ignora falhas de remoção no storage
        }
    },

    clear(): void {
        const storage = getStorage();
        if (!storage) {
            return;
        }

        try {
            const keysToRemove: string[] = [];
            for (let i = 0; i < storage.length; i++) {
                const storageKey = storage.key(i);
                if (storageKey?.startsWith(STORAGE_PREFIX)) {
                    keysToRemove.push(storageKey);
                }
            }

            for (const key of keysToRemove) {
                storage.removeItem(key);
            }
        } catch {
            // Ignora falhas na limpeza do storage
        }
    }
};
