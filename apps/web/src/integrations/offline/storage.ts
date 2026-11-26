import type { Query, QueryClient } from '@tanstack/react-query';

import {
    PERSIST_MAX_AGE,
    serializeCache,
    shouldPersistQuery
} from '@followw/core/queries/persist.ts';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { noop } from '@tanstack/react-query';
import { persistQueryClient, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

import {
    PAGES_CACHE_PREFIX,
    PAGES_SESSION_MARKER,
    pagesCacheName
} from '#/integrations/offline/pages-cache';

const QUERY_CACHE_KEY = 'followw-query-cache';
let stopPersisting: () => void = noop;
let warming: AbortController | undefined;
let clearing: Promise<void> | undefined;

/** Restaura o cache salvo no IndexedDB (avisando em `onRestored`) e salva cada mudança; devolve a função que para de salvar. */
export function persistQueryCache(queryClient: QueryClient, onRestored: () => void = noop) {
    if (typeof indexedDB === 'undefined') {
        onRestored();
        return noop;
    }
    stopPersisting();
    let stopped = false;
    const persister = createAsyncStoragePersister({
        key: QUERY_CACHE_KEY,
        throttleTime: 200,
        storage: {
            getItem: async (key) => {
                const snapshot = await get<string>(key);
                return stopped ? null : snapshot;
            },
            setItem: async (key, value) => {
                if (!stopped) await set(key, value);
            },
            removeItem: async (key) => {
                if (!stopped) await del(key);
            }
        },
        serialize: serializeCache
    });
    const options = {
        queryClient,
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: import.meta.env.VITE_QUERY_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: (query: Query) => shouldPersistQuery(query) }
    };
    const [unsubscribe, restoring] = persistQueryClient(options);
    // Salva também os dados que já chegaram no HTML, sem esperar outra consulta.
    restoring
        .catch(noop)
        .then(() => {
            if (stopped) return undefined;
            onRestored();
            return persistQueryClientSave(options);
        })
        .catch(noop);
    const stop = () => {
        stopped = true;
        unsubscribe();
        if (stopPersisting === stop) stopPersisting = noop;
    };
    stopPersisting = stop;
    return stop;
}

async function deletePageCaches(keep?: string, signal?: AbortSignal) {
    const names = await caches.keys();
    if (signal?.aborted) return;
    await Promise.all(
        names
            .filter((name) => name.startsWith(PAGES_CACHE_PREFIX) && name !== keep)
            .map((name) => caches.delete(name))
    );
}

async function cachePage(cache: Cache, url: string, signal: AbortSignal) {
    if ((await cache.match(url)) || signal.aborted) return;
    // oxlint-disable-next-line no-restricted-globals -- baixa o HTML da própria página, não a API
    const response = await fetch(url, { signal });
    // navegação não aceita resposta redirecionada (ex.: /perfil → /login)
    if (!signal.aborted && response.ok && !response.redirected) await cache.put(url, response);
}

/** Baixa para o cache do SW as páginas principais que faltam e apaga os caches de builds antigos. */
export async function warmPages() {
    if (warming || clearing) return;
    const controller = new AbortController();
    warming = controller;
    const current = pagesCacheName(import.meta.env.VITE_BUILD_ID ?? 'dev');
    try {
        await deletePageCaches(current, controller.signal);
        if (controller.signal.aborted) return;
        const cache = await caches.open(current);
        const marker = await cache.match(PAGES_SESSION_MARKER);
        if (controller.signal.aborted) return;
        if (!marker) await cache.put(PAGES_SESSION_MARKER, new Response(crypto.randomUUID()));
        const urls = ['/', '/ru', '/turmas', '/perfil'];
        await Promise.allSettled(urls.map((url) => cachePage(cache, url, controller.signal)));
    } finally {
        if (warming === controller) warming = undefined;
    }
}

async function unregisterServiceWorkers() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
}

/** Apaga dados e HTML da sessão; os arquivos públicos do build podem ser reaproveitados. */
export function clearOfflineData() {
    if (clearing) return clearing;
    stopPersisting();
    warming?.abort();
    warming = undefined;
    clearing = Promise.allSettled([
        typeof indexedDB !== 'undefined' && del(QUERY_CACHE_KEY),
        typeof caches !== 'undefined' && deletePageCaches(),
        typeof navigator !== 'undefined' &&
            'serviceWorker' in navigator &&
            unregisterServiceWorkers()
    ]).then(() => {
        clearing = undefined;
        return undefined;
    });
    return clearing;
}
