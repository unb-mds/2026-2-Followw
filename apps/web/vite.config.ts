import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

const config = defineConfig({
    resolve: { tsconfigPaths: true },
    plugins: [
        devtools(),
        nitro({
            rollupConfig: { external: [/^@sentry\//] },
            routeRules: {
                '/api/**': {
                    redirect: {
                        to: 'https://api.followw.app/**',
                        status: 308
                    }
                }
            }
        }),
        tailwindcss(),
        tanstackStart(),
        viteReact()
    ]
});

export default config;
