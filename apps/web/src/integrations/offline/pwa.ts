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
const fallbackToParentPage = async ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname;
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/';
    const options = { ignoreSearch: true };
    return (await caches.match(parent, options)) ?? (await caches.match('/', options));
};

type PageCacheState = { pages?: Cache };

const rememberPageCache = async ({ state }: { state?: PageCacheState }) => {
    if (!state) return;
    try {
        const [cacheName, oldCache] = (await caches.keys()).filter((name) =>
            name.startsWith('followw-pages-')
        );
        if (!cacheName || oldCache) return;
        const path = '/.followw-offline-session';
        const marker = await caches.match(path, { cacheName });
        if (!marker) return;
        const id = await marker.text();
        const cache = await caches.open(cacheName);
        if ((await (await cache.match(path))?.text()) === id) state.pages = cache;
    } catch {
        // A navegação continua mesmo se o navegador negar acesso ao cache.
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
export const pwaPlugins = (buildId: string) =>
    clientOnly(
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
                            cacheName: pagesCacheName(buildId),
                            networkTimeoutSeconds: 3,
                            matchOptions: { ignoreSearch: true },
                            plugins: [
                                {
                                    handlerWillStart: rememberPageCache,
                                    fetchDidSucceed: savePageInSession,
                                    cacheWillUpdate: async () => null,
                                    handlerDidError: fallbackToParentPage
                                }
                            ]
                        }
                    }
                ]
            }
        })
    );
