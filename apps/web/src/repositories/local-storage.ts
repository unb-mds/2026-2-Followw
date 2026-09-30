const STORAGE_PREFIX = 'followw:';

export const STORAGE_KEYS = {
    CARD_TOKEN: 'card-token',
    BALANCE: 'balance'
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

export const localStorageRepository = {
    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T especifica o tipo retornado ao ler o storage
    get<T = unknown>(key: string): T | null {
        const storage = getStorage();
        if (!storage) {
            return null;
        }

        try {
            const item = storage.getItem(formatKey(key));
            if (item === null) {
                return null;
            }
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- o retorno do JSON.parse é tipado como T pelo consumidor
            return JSON.parse(item) as T;
        } catch {
            return null;
        }
    },

    // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- T especifica o tipo aceito para serialização
    set<T>(key: string, value: T): void {
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
