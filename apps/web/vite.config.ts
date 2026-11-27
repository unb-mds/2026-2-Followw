import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

import { pwaPlugins } from '#/integrations/offline/pwa';

const BUILD_ID = Date.now().toString(36);
// o cache persistido do TanStack Query só é descartado quando o contrato da API muda
const QUERY_CACHE_BUSTER = createHash('sha256')
    .update(readFileSync('../../packages/core/src/queries/schema.gen.ts'))
    .digest('hex')
    .slice(0, 12);

const isNodeMiddleware = process.env.NITRO_PRESET === 'node-middleware';

const config = defineConfig({
    resolve: { tsconfigPaths: true },
    define: {
        'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID),
        'import.meta.env.VITE_QUERY_CACHE_BUSTER': JSON.stringify(QUERY_CACHE_BUSTER)
    },
    plugins: [
        nitro({
            rollupConfig: { external: [/^@sentry\//] },
            serveStatic: isNodeMiddleware ? 'node' : undefined,
            compressPublicAssets: isNodeMiddleware ? true : undefined,
            routeRules: isNodeMiddleware
                ? {
                      '/assets/**': {
                          headers: { 'cache-control': 'public, max-age=31536000, immutable' }
                      },
                      '/sw.js': {
                          headers: { 'cache-control': 'no-cache' }
                      }
                  }
                : undefined,
            // só no dev; na Vercel, o vercel.json faz o mesmo
            devProxy: { '/api/**': 'http://127.0.0.1:8000' }
        }),
        tailwindcss(),
        tanstackStart(),
        viteReact(),
        pwaPlugins(BUILD_ID)
    ]
});

export default config;
