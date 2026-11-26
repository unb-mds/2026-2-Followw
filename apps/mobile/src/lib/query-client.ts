import type { PersistedClient } from '@tanstack/react-query-persist-client';

import { ApiError } from '@followw/core/queries/errors.ts';
import { credentialsQueryOptions } from '@followw/core/queries/restaurant-account.ts';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import {
    MutationCache,
    type Query,
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

// também é o gcTime das queries, senão a query sai do cache antes de vencer no disco
export const PERSIST_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

const CARD_PATH = credentialsQueryOptions('').queryKey[1];

// falha ao atualizar não invalida o último dado salvo
export function serializeCache(snapshot: PersistedClient) {
    for (const { queryKey, state } of snapshot.clientState.queries) {
        if (state.status === 'error') {
            state.status = 'success';
            state.error = null;
            state.fetchFailureReason = null;
            state.fetchFailureCount = 0;
            if (queryKey[1] === CARD_PATH) state.isInvalidated = false;
        }
    }
    return JSON.stringify(snapshot);
}

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

// sem o prazo, query sem uso (ex.: cardápio de semana antiga) é salva de novo a cada sessão e nunca
// sai; `meta.persist: false` fica só na memória
export function shouldPersistQuery(query: Query, now = Date.now()) {
    return (
        query.meta?.persist !== false &&
        query.state.data !== undefined &&
        now - query.state.dataUpdatedAt < PERSIST_MAX_AGE
    );
}

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
