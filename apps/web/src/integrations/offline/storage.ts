import type { QueryClient } from '@tanstack/react-query';

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { noop } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

import { PAGES_CACHE_PREFIX, pagesCacheName } from '#/integrations/offline/pages-cache';

// também é o gcTime das queries no navegador, senão a query sai do cache antes de vencer no disco
export const PERSIST_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

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

async function deletePageCaches(keep?: string) {
    const names = await caches.keys();
    await Promise.all(
        names
            .filter((name) => name.startsWith(PAGES_CACHE_PREFIX) && name !== keep)
            .map((name) => caches.delete(name))
    );
}

async function cachePage(cache: Cache, url: string) {
    if (await cache.match(url)) return;
    // oxlint-disable-next-line no-restricted-globals -- baixa o HTML da própria página, não a API
    const response = await fetch(url);
    // navegação não aceita resposta redirecionada (ex.: /perfil → /login)
    if (response.ok && !response.redirected) await cache.put(url, response);
}

/** Baixa para o cache do SW as páginas principais que faltam e apaga os caches de builds antigos. */
export async function warmPages(loggedIn: boolean) {
    const current = pagesCacheName(import.meta.env.VITE_BUILD_ID ?? 'dev');
    await deletePageCaches(current);
    const cache = await caches.open(current);
    const urls = ['/', '/ru', '/turmas', loggedIn ? '/perfil' : '/login'];
    await Promise.allSettled(urls.map((url) => cachePage(cache, url)));
}

/** Apaga do dispositivo os dados da API e o HTML das páginas, que também traz dados do SSR. */
export async function clearOfflineData() {
    await Promise.allSettled([
        persister?.removeClient(),
        typeof caches !== 'undefined' && deletePageCaches()
    ]);
}
