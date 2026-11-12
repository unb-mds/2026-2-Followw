import type * as StartServer from '@tanstack/react-start/server';

import { createIsomorphicFn } from '@tanstack/react-start';

export type SsrServer = typeof StartServer;

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
