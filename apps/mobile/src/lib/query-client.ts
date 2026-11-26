import { ApiError } from '@followw/core/queries/errors.ts';
import { PERSIST_MAX_AGE, serializeCache } from '@followw/core/queries/persist.ts';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
    MutationCache,
    QueryCache,
    QueryClient,
    focusManager,
    onlineManager
} from '@tanstack/react-query';
import Constants from 'expo-constants';
import { AppState, Platform } from 'react-native';

import { watchNetwork } from '@/lib/network';
import { cacheStorage } from '@/lib/storage';
import { clearSession } from '@/queries/auth';

export const persister = createAsyncStoragePersister({
    key: 'followw-query-cache',
    storage: {
        getItem: (key) => cacheStorage.getString(key) ?? null,
        setItem: (key, value) => cacheStorage.set(key, value),
        removeItem: (key) => void cacheStorage.remove(key)
    },
    serialize: serializeCache
});

// uma versão nova do app pode mudar o formato das respostas
export const PERSIST_BUSTER = Constants.expoConfig?.version ?? 'dev';

onlineManager.setEventListener(watchNetwork);

if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

// sessão expirou enquanto o /me ainda estava em cache
const onError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) clearSession(queryClient);
};

export const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
        queries: {
            staleTime: 60_000,
            gcTime: PERSIST_MAX_AGE,
            networkMode: 'always',
            retry: (failureCount, error) =>
                onlineManager.isOnline() &&
                !(error instanceof ApiError && error.status < 500) &&
                failureCount < 2
        },
        mutations: { networkMode: 'always' }
    }
});
