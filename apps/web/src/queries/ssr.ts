import type * as StartServer from '@tanstack/react-start/server';

import { createIsomorphicFn } from '@tanstack/react-start';

export type SsrServer = typeof StartServer;

export function ssrApiTarget(path: string, request: Request, publicUrl = request.url) {
    const origin = process.env.FOLLOWW_SSR_API_ORIGIN;
    if (!origin) return { url: new URL(path, publicUrl) };

    const protocol =
        process.env.FOLLOWW_TRUST_PROXY === '1' &&
        request.headers.get('x-forwarded-proto') === 'https'
            ? 'https'
            : new URL(request.url).protocol.slice(0, -1);
    return { url: new URL(path.replace(/^\/api(?=\/|\?|$)/, ''), origin), protocol };
}

/** Funções do servidor ligadas à requisição SSR em curso; `null` no navegador ou fora de uma requisição. */
export const ssrRequest = createIsomorphicFn()
    .client(async () => null)
    .server(async (): Promise<SsrServer | null> => {
        const server = await import('@tanstack/react-start/server');
        try {
            server.getRequest();
            return server;
        } catch {
            return null;
        }
    });
