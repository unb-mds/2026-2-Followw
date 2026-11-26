import type { DehydratedState, Query } from '@tanstack/react-query';

import { credentialsQueryOptions } from './restaurant-account.ts';

// também é o gcTime das queries, senão a query sai do cache antes de vencer no disco
export const PERSIST_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

const CARD_PATH = credentialsQueryOptions('').queryKey[1];

// sem o prazo, query sem uso (ex.: cardápio de semana antiga) é salva de novo a cada sessão e nunca
// sai; uma falha ao atualizar não invalida o último dado; `meta.persist: false` fica só na memória
export function shouldPersistQuery(query: Query, now = Date.now()) {
    return (
        query.meta?.persist !== false &&
        query.state.data !== undefined &&
        now - query.state.dataUpdatedAt < PERSIST_MAX_AGE
    );
}

/** Salva a falha ao atualizar como sucesso, com o último dado; a carteirinha volta válida. */
export function serializeCache(snapshot: { clientState: DehydratedState }) {
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
