import { PAGES_CACHE_PREFIX, pagesCacheName } from '#/lib/pages-cache';

export const currentPagesCacheName = () => pagesCacheName(import.meta.env.VITE_BUILD_ID ?? 'dev');

/** Páginas guardadas para abrir offline mesmo sem terem sido visitadas. */
export const offlinePages = (loggedIn: boolean) => [
    '/',
    '/ru',
    '/turmas',
    loggedIn ? '/perfil' : '/login'
];

const hasCacheStorage = () => typeof caches !== 'undefined';

/** O SW só é gerado no build de produção. */
export const serviceWorkerEnabled = () => import.meta.env.PROD && 'serviceWorker' in navigator;

export function registerServiceWorker() {
    if (!serviceWorkerEnabled()) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
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

/** Baixa as páginas que faltam no cache do SW e apaga os caches de builds antigos. */
export async function warmPages(urls: string[]) {
    if (!hasCacheStorage()) return;
    const current = currentPagesCacheName();
    await deletePageCaches(current);
    const cache = await caches.open(current);
    await Promise.allSettled(urls.map((url) => cachePage(cache, url)));
}

export async function clearCachedPages() {
    if (hasCacheStorage()) await deletePageCaches();
}
