import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { pagesCacheName } from '#/integrations/offline/pages-cache.ts';

// o vite-plugin-pwa não conhece environments: sem isso também roda no build do SSR
const clientOnly = (plugins: Plugin[]): Plugin[] =>
    plugins.map((plugin) => ({
        ...plugin,
        applyToEnvironment: (env: { name: string }) => env.name === 'client'
    }));

// O workbox serializa esta função dentro do sw.js: não pode referenciar nada de fora dela.
// URL nunca visitada: cai na página pai (/turmas/x → /turmas) ou na home.
const fallbackToParentPage = async ({
    request,
    state
}: {
    request: Request;
    state?: PageCacheState;
}) => {
    const pages = state?.pages;
    if (!pages) return undefined;
    const path = new URL(request.url).pathname;
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/';
    const options = { ignoreSearch: true };
    return (await pages.match(parent, options)) ?? (await pages.match('/', options));
};

type PageCacheState = { name?: string; pages?: Cache };

const rememberPageCache = async ({ state }: { state?: PageCacheState }) => {
    if (!state) return;
    try {
        const params = new URL(globalThis.location.href).searchParams;
        const name = params.get('pages');
        const session = params.get('session');
        if (!name || !session) return;
        const pages = await caches.open(name);
        const owner = await (await pages.match('/.followw-offline-session'))?.text();
        if (owner === session) Object.assign(state, { name, pages });
    } catch {
        // A navegação continua se o navegador negar acesso ao cache.
    }
};

const savePageInSession = async ({
    request,
    response,
    event,
    state
}: {
    request: Request;
    response: Response;
    event: { waitUntil: (pending: Promise<unknown>) => void };
    state?: PageCacheState;
}) => {
    // A referência antiga deixa de apontar para o cache acessível após o logout.
    if (state?.pages && response.status === 200 && !response.redirected)
        event.waitUntil(state.pages.put(request, response.clone()).catch(() => undefined));
    return response;
};

// O HTML do SSR é cacheado em runtime, por URL.
export const pwaPlugins = (buildId: string) => {
    const cacheName = pagesCacheName(buildId);
    const pageCachePlugin = {
        handlerWillStart: rememberPageCache,
        fetchDidSucceed: savePageInSession,
        cacheWillUpdate: async () => null,
        cachedResponseWillBeUsed: async ({
            cacheName: activeCacheName,
            request,
            matchOptions,
            state
        }: {
            cacheName: string;
            request: Request;
            matchOptions?: CacheQueryOptions;
            state?: PageCacheState;
        }) => {
            if (state?.name === activeCacheName) return state.pages?.match(request, matchOptions);
            // O worker pode atualizar antes de a aba registrar a URL do build novo.
            if (state) state.pages = undefined;
            return undefined;
        },
        handlerDidError: fallbackToParentPage
    };
    return clientOnly(
        VitePWA({
            // o SW vai para a pasta pública do preset do nitro (.output/public, .vercel/output/static...)
            integration: {
                configureOptions: (viteConfig, options) => {
                    options.outDir = viteConfig.environments.client.build.outDir;
                }
            },
            injectRegister: null,
            registerType: 'autoUpdate',
            manifest: false,
            workbox: {
                globPatterns: ['assets/**/*.{js,css,woff2}'],
                // public/ só é copiado pelo nitro depois do build do client
                additionalManifestEntries: ['/favicon.svg', '/manifest.json'].map((url) => ({
                    url,
                    revision: createHash('sha256')
                        .update(readFileSync(`public${url}`))
                        .digest('hex')
                })),
                navigateFallback: null,
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                    {
                        urlPattern: ({ request }) => request.mode === 'navigate',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName,
                            networkTimeoutSeconds: 3,
                            matchOptions: { ignoreSearch: true },
                            plugins: [pageCachePlugin]
                        }
                    }
                ]
            }
        })
    );
};
