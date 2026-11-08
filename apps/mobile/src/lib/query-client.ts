import { ApiError } from '@followw/core/queries/errors.ts';
import { recommendationsQueryOptions } from '@followw/core/queries/recommendations.ts';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
    MutationCache,
    type Query,
    QueryCache,
    QueryClient,
    focusManager,
    hashKey,
    onlineManager
} from '@tanstack/react-query';
import Constants from 'expo-constants';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { cacheStorage } from '@/lib/storage';
import { clearSession } from '@/queries/auth';

// também é o gcTime das queries, senão a query sai do cache antes de vencer no disco
export const PERSIST_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

export const persister = createAsyncStoragePersister({
    key: 'followw-query-cache',
    storage: {
        getItem: (key) => cacheStorage.getString(key) ?? null,
        setItem: (key, value) => cacheStorage.set(key, value),
        removeItem: (key) => void cacheStorage.remove(key)
    }
});

// uma versão nova do app pode mudar o formato das respostas
export const PERSIST_BUSTER = Constants.expoConfig?.version ?? 'dev';

// sem isso, query sem uso (ex.: cardápio de semana antiga) é salva de novo a cada sessão e nunca sai
export function shouldPersistQuery(query: Query, now = Date.now()) {
    return (
        query.queryHash !== hashKey(recommendationsQueryOptions.queryKey) &&
        query.state.status === 'success' &&
        now - query.state.dataUpdatedAt < PERSIST_MAX_AGE
    );
}

onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) =>
        setOnline(state.isConnected !== false)
    );
    return () => subscription.remove();
});

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
