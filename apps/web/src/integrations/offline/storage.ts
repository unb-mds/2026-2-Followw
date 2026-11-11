import type { Query, QueryClient } from '@tanstack/react-query';

import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { hashKey, noop } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

import {
    academicAsset,
    academicManifestPath,
    PAGES_CACHE_PREFIX,
    pagesCacheName
} from '#/integrations/offline/pages-cache';
import { recommendationsQueryOptions } from '#/queries/recommendations';

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

// sem isso, query sem uso (ex.: cardápio de semana antiga) é salva de novo a cada sessão e nunca sai
export function shouldPersistQuery(query: Query, now = Date.now()) {
    return (
        query.queryHash !== hashKey(recommendationsQueryOptions.queryKey) &&
        query.state.status === 'success' &&
        now - query.state.dataUpdatedAt < PERSIST_MAX_AGE
    );
}

/** Restaura o cache salvo no IndexedDB (avisando em `onRestored`) e salva cada mudança; devolve a função que para de salvar. */
export function persistQueryCache(queryClient: QueryClient, onRestored: () => void = noop) {
    if (!persister) {
        onRestored();
        return noop;
    }
    const [unsubscribe, restoring] = persistQueryClient({
        queryClient,
        persister,
        maxAge: PERSIST_MAX_AGE,
        buster: import.meta.env.VITE_QUERY_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: (query) => shouldPersistQuery(query) }
    });
    // falha ao restaurar já descarta o cache salvo
    restoring.catch(noop).finally(onRestored);
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

async function cacheResource(cache: Cache, url: string) {
    if (await cache.match(url)) return;
    // oxlint-disable-next-line no-restricted-globals -- baixa arquivos da própria aplicação, não a API
    const response = await fetch(url);
    // navegação não aceita resposta redirecionada (ex.: /perfil → /login)
    if (response.ok && !response.redirected) await cache.put(url, response);
}

async function warmAcademicAssets(cache: Cache, buildId: string, assetPrefix = '/assets/') {
    const manifestPath = academicManifestPath(buildId);
    await cacheResource(cache, manifestPath);
    const urls: unknown = await (await cache.match(manifestPath))?.clone().json();
    if (!Array.isArray(urls)) return;
    const assets = urls.filter(
        (url: unknown): url is string =>
            typeof url === 'string' && url.startsWith(assetPrefix) && academicAsset.test(url)
    );
    await Promise.allSettled(assets.map((url) => cacheResource(cache, url)));
}

// Guarda o gráfico mesmo se a primeira importação ocorrer antes de o SW assumir a página.
export async function warmStatisticsChart() {
    const buildId = import.meta.env.VITE_BUILD_ID;
    if (!buildId || typeof window === 'undefined' || !('caches' in window) || !navigator.onLine)
        return;
    const cache = await caches.open(pagesCacheName(buildId));
    await warmAcademicAssets(cache, buildId, '/assets/StatisticsChart-');
}

/** Baixa para o cache do SW as páginas principais que faltam e apaga os caches de builds antigos. */
export async function warmPages(loggedIn: boolean) {
    const buildId = import.meta.env.VITE_BUILD_ID ?? 'dev';
    const current = pagesCacheName(buildId);
    await deletePageCaches(current);
    const cache = await caches.open(current);
    const urls = ['/', '/ru', '/turmas', loggedIn ? '/perfil' : '/login'];
    const resources = urls.map((url) => cacheResource(cache, url));
    if (loggedIn) resources.push(warmAcademicAssets(cache, buildId));
    await Promise.allSettled(resources);
}

/** Apaga do dispositivo os dados da API e o HTML das páginas, que também traz dados do SSR. */
export async function clearOfflineData() {
    await Promise.allSettled([
        persister?.removeClient(),
        typeof caches !== 'undefined' && deletePageCaches()
    ]);
}
