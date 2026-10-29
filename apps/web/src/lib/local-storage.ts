export const STORAGE_PREFIX = 'followw:';

export const STORAGE_KEYS = {
    THEME: 'theme',
    SCHEDULE: 'schedule'
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

/** Cookies bloqueados: o navegador também nega o storage do site e o login não se mantém. */
export function isStorageBlocked(): boolean {
    if (typeof window === 'undefined') return false;
    if (!window.navigator.cookieEnabled) return true;
    try {
        void window.localStorage;
        return false;
    } catch {
        return true;
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

// Dados da conta, apagados ao trocar de sessão.
const ACCOUNT_KEYS: string[] = [STORAGE_KEYS.SCHEDULE];
const stores = new Map<string, { clear: () => void }>();

/** Valor salvo no storage e observável pelo `useSyncExternalStore`. */
export function storedValue<T>(key: string, empty: T) {
    const listeners = new Set<() => void>();
    let snapshot: T | undefined;
    const update = (value: T) => {
        snapshot = value;
        for (const listener of listeners) listener();
    };
    const store = {
        getSnapshot: () => (snapshot ??= localStorageRepository.get<T>(key) ?? empty),
        getServerSnapshot: () => empty,
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0) snapshot = undefined;
            };
        },
        set: (value: T) => {
            localStorageRepository.set(key, value);
            update(value);
        },
        clear: () => {
            localStorageRepository.remove(key);
            update(empty);
        }
    };
    stores.set(key, store);
    return store;
}

export function clearAccountStorage() {
    for (const key of ACCOUNT_KEYS) {
        localStorageRepository.remove(key);
        stores.get(key)?.clear();
    }
}
