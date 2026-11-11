import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import {
    academicAsset,
    academicManifestPath,
    pagesCacheName
} from '#/integrations/offline/pages-cache.ts';

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

// O HTML do SSR é cacheado em runtime, por URL.
export const pwaPlugins = (buildId: string) =>
    clientOnly(
        VitePWA({
            // o SW vai para a pasta pública do preset do nitro (.output/public, .vercel/output/static...)
            integration: {
                configureOptions: (viteConfig, options) => {
                    options.outDir = viteConfig.environments.client.build.outDir;
                    const manifestFile = resolve(
                        viteConfig.root,
                        options.outDir,
                        academicManifestPath(buildId).slice(1)
                    );
                    options.workbox = {
                        ...options.workbox,
                        manifestTransforms: [
                            (entries) => {
                                const deferred = entries.filter(({ url }) =>
                                    academicAsset.test(`/${url}`)
                                );
                                writeFileSync(
                                    manifestFile,
                                    JSON.stringify(deferred.map(({ url }) => `/${url}`))
                                );
                                return {
                                    manifest: entries.filter((entry) => !deferred.includes(entry)),
                                    warnings: []
                                };
                            }
                        ]
                    };
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
                        urlPattern: academicAsset,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: pagesCacheName(buildId),
                            cacheableResponse: { statuses: [200] }
                        }
                    },
                    {
                        urlPattern: ({ request }) => request.mode === 'navigate',
                        handler: 'NetworkFirst',
                        options: {
                            cacheName: pagesCacheName(buildId),
                            networkTimeoutSeconds: 3,
                            matchOptions: { ignoreSearch: true },
                            cacheableResponse: { statuses: [200] },
                            plugins: [{ handlerDidError: fallbackToParentPage }]
                        }
                    }
                ]
            }
        })
    );
