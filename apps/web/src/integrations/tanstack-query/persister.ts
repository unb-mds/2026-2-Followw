import type { QueryClient } from '@tanstack/react-query';

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { noop } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

import { PERSIST_MAX_AGE } from '#/integrations/tanstack-query/cache-age';

// sem IndexedDB (SSR) não há persistência
const persister =
    typeof indexedDB === 'undefined'
        ? null
        : createAsyncStoragePersister({
              storage: { getItem: get, setItem: set, removeItem: del },
              key: 'followw-query-cache'
          });

/** Restaura o cache salvo no IndexedDB e salva cada mudança; devolve a função que para de salvar. */
export function persistQueryCache(queryClient: QueryClient) {
    if (!persister) return noop;
    const [unsubscribe, restoring] = persistQueryClient({
        queryClient,
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: import.meta.env.VITE_QUERY_CACHE_BUSTER
    });
    // falha ao restaurar já descarta o cache salvo
    restoring.catch(noop);
    return unsubscribe;
}

export async function clearPersistedQueries() {
    await persister?.removeClient();
}
