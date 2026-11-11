import type { Query, QueryClient } from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { hashKey, noop } from '@tanstack/react-query';
import { persistQueryClient, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { del, get, update } from 'idb-keyval';

import type { OfflineSession } from '#/integrations/offline/session';

import {
    PAGES_CACHE_PREFIX,
    PAGES_SESSION_MARKER,
    pagesCacheName
} from '#/integrations/offline/pages-cache';
import { bindOfflineSession, isCurrentOfflineSession } from '#/integrations/offline/session';
import { recommendationsQueryOptions } from '#/queries/recommendations';

// também é o gcTime das queries no navegador, senão a query sai do cache antes de vencer no disco
export const PERSIST_MAX_AGE = 14 * 24 * 60 * 60 * 1000;

const QUERY_CACHE_KEY = 'followw-query-cache';
let stopPersisting: () => void = noop;
let warming: AbortController | undefined;
let clearing: Promise<void> | undefined;

// Uma falha ao atualizar não invalida o último dado salvo.
export function shouldPersistQuery(query: Query, now = Date.now()) {
    return (
        query.queryHash !== hashKey(recommendationsQueryOptions.queryKey) &&
        query.state.data !== undefined &&
        now - query.state.dataUpdatedAt < PERSIST_MAX_AGE
    );
}

export function mergeOfflineSnapshots(
    saved: PersistedClient,
    incoming: PersistedClient,
    now = Date.now()
) {
    if (saved.buster !== incoming.buster) return incoming;
    const queries = new Map(incoming.clientState.queries.map((query) => [query.queryHash, query]));
    for (const query of saved.clientState.queries) {
        const updatedAt = queries.get(query.queryHash)?.state.dataUpdatedAt ?? 0;
        if (
            now - query.state.dataUpdatedAt < PERSIST_MAX_AGE &&
            query.state.dataUpdatedAt > updatedAt
        )
            queries.set(query.queryHash, query);
    }
    return {
        ...incoming,
        clientState: { ...incoming.clientState, queries: [...queries.values()] }
    };
}

/** Restaura o cache salvo no IndexedDB (avisando em `onRestored`) e salva cada mudança; devolve a função que para de salvar. */
export function persistQueryCache(
    queryClient: QueryClient,
    registration: string,
    onRestored: () => void = noop
) {
    if (typeof window === 'undefined') {
        onRestored();
        return noop;
    }
    stopPersisting();
    const session = bindOfflineSession(registration);
    if (typeof indexedDB === 'undefined' || !session || !isCurrentOfflineSession(session)) {
        onRestored();
        return noop;
    }
    let stopped = false;
    let restoredSnapshot: string | undefined;
    const active = () => !stopped && isCurrentOfflineSession(session);
    const persister = createAsyncStoragePersister({
        key: QUERY_CACHE_KEY,
        throttleTime: 200,
        storage: {
            getItem: async (key) => {
                const snapshot = await get<string>(key);
                if (!active()) return null;
                restoredSnapshot = snapshot;
                return snapshot;
            },
            setItem: async (key, value) => {
                if (!active()) return;
                await update<string | undefined>(key, (saved) => {
                    if (!active()) return saved;
                    if (!saved) return value;
                    try {
                        return JSON.stringify(
                            mergeOfflineSnapshots(JSON.parse(saved), JSON.parse(value))
                        );
                    } catch {
                        return value;
                    }
                });
            },
            removeItem: async (key) => {
                if (active())
                    await update<string | undefined>(key, (saved) =>
                        active() && saved === restoredSnapshot ? undefined : saved
                    );
            }
        },
        serialize: (snapshot) => {
            for (const { state } of snapshot.clientState.queries) {
                if (state.status === 'error') {
                    state.status = 'success';
                    state.error = null;
                    state.fetchFailureReason = null;
                    state.fetchFailureCount = 0;
                }
            }
            return JSON.stringify(snapshot);
        }
    });
    const options = {
        queryClient,
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: `${import.meta.env.VITE_QUERY_CACHE_BUSTER}:${session.id}`,
        dehydrateOptions: { shouldDehydrateQuery: (query: Query) => shouldPersistQuery(query) }
    };
    const [unsubscribe, restoring] = persistQueryClient(options);
    // Salva também os dados que já chegaram no HTML, sem esperar outra consulta.
    restoring
        .catch(noop)
        .then(() => {
            if (stopped) return undefined;
            onRestored();
            if (active()) return persistQueryClientSave(options);
            return undefined;
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

async function deletePageCaches(keep?: string, active = () => true) {
    const names = await caches.keys();
    if (!active()) return;
    await Promise.all(
        names
            .filter((name) => name.startsWith(PAGES_CACHE_PREFIX) && name !== keep)
            .map((name) => caches.delete(name))
    );
}

async function cachePage(cache: Cache, url: string, signal: AbortSignal, active: () => boolean) {
    if ((await cache.match(url)) || !active()) return;
    // oxlint-disable-next-line no-restricted-globals -- baixa o HTML da própria página, não a API
    const response = await fetch(url, { signal });
    // navegação não aceita resposta redirecionada (ex.: /perfil → /login)
    if (active() && response.ok && !response.redirected) await cache.put(url, response);
}

/** Baixa para o cache do SW as páginas principais que faltam e apaga os caches de builds antigos. */
export async function warmPages(session: OfflineSession) {
    if (warming || clearing || !isCurrentOfflineSession(session)) return;
    const controller = new AbortController();
    const active = () => !controller.signal.aborted && isCurrentOfflineSession(session);
    warming = controller;
    const current = pagesCacheName(import.meta.env.VITE_BUILD_ID ?? 'dev');
    try {
        await deletePageCaches(current, active);
        if (!active()) return;
        const cache = await caches.open(current);
        const owner = await (await cache.match(PAGES_SESSION_MARKER))?.text();
        if (!active() || (owner && owner !== session.id)) return;
        if (!owner) await cache.put(PAGES_SESSION_MARKER, new Response(session.id));
        const urls = ['/', '/ru', '/turmas', '/perfil'];
        await Promise.allSettled(
            urls.map((url) => cachePage(cache, url, controller.signal, active))
        );
    } finally {
        if (warming === controller) warming = undefined;
    }
}

async function unregisterServiceWorkers() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
}

export function stopOfflineWork() {
    stopPersisting();
    warming?.abort();
    warming = undefined;
}

/** Apaga dados e HTML da sessão; os arquivos públicos do build podem ser reaproveitados. */
export function clearOfflineData() {
    stopOfflineWork();
    if (clearing) return clearing;
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
