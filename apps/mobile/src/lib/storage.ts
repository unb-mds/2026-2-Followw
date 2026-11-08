import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({ id: 'followw' });
export const cacheStorage = createMMKV({ id: 'query-cache' });

export const STORAGE_KEYS = {
    THEME: 'theme',
    SCHEDULE: 'schedule'
} as const;

// dados da conta, apagados ao trocar de sessão
const ACCOUNT_KEYS: string[] = [STORAGE_KEYS.SCHEDULE];
const stores = new Map<string, { clear: () => void }>();

function read<T>(key: string, empty: T): T {
    const raw = storage.getString(key);
    if (raw === undefined) return empty;
    try {
        const parsed: T = JSON.parse(raw);
        return parsed;
    } catch {
        return empty;
    }
}

/** Valor salvo no dispositivo e observável pelo `useSyncExternalStore`. */
export function storedValue<T>(key: string, empty: T) {
    const listeners = new Set<() => void>();
    let snapshot: T | undefined;
    const update = (value: T) => {
        snapshot = value;
        for (const listener of listeners) listener();
    };
    const store = {
        getSnapshot: () => (snapshot ??= read(key, empty)),
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        set: (value: T) => {
            storage.set(key, JSON.stringify(value));
            update(value);
        },
        clear: () => {
            storage.remove(key);
            update(empty);
        }
    };
    stores.set(key, store);
    return store;
}

export function clearAccountStorage() {
    for (const key of ACCOUNT_KEYS) {
        storage.remove(key);
        stores.get(key)?.clear();
    }
}

export function clearPersistedCache() {
    cacheStorage.clearAll();
}
