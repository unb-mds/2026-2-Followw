import type { Middleware } from 'openapi-fetch';

import { apiClient, setApiOrigin } from '@followw/core/queries/client.ts';
import { createIsomorphicFn } from '@tanstack/react-start';

const getSsrHeaders = createIsomorphicFn()
    .client(() => new Headers())
    .server(async () => {
        const headers = new Headers();
        try {
            const { getRequest } = await import('@tanstack/react-start/server');
            const incoming = getRequest();
            const cookie = incoming.headers.get('cookie');
            if (cookie) headers.set('cookie', cookie);
            // a assinatura do IP é opcional: falhar aqui não pode derrubar a sessão
            const { clientIpHeaders } = await import('#/queries/client-ip.server');
            clientIpHeaders(incoming).forEach((value, name) => headers.set(name, value));
        } catch {}
        return headers;
    });

const toSsrOrigin = createIsomorphicFn()
    .client((request: Request) => request)
    .server(async (request: Request) => {
        const { getRequestUrl } = await import('@tanstack/react-start/server');
        try {
            const { pathname, search } = new URL(request.url);
            return new Request(new URL(pathname + search, getRequestUrl()), request);
        } catch {
            return request;
        }
    });

const forwardSsrSetCookie = createIsomorphicFn()
    .client((_cookies: string[]) => {})
    .server(async (cookies: string[]) => {
        const { setResponseHeader } = await import('@tanstack/react-start/server');
        try {
            setResponseHeader('set-cookie', cookies);
        } catch {}
    });

const ssrMiddleware: Middleware = {
    async onRequest({ request: original }) {
        const request = await toSsrOrigin(original);
        const headers = await getSsrHeaders();
        headers.forEach((value, name) => request.headers.set(name, value));
        return request;
    },
    async onResponse({ response }) {
        const cookies = response.headers.getSetCookie();
        if (cookies.length) await forwardSsrSetCookie(cookies);
    }
};

const setServerOrigin = createIsomorphicFn()
    .client(() => {})
    .server(() => setApiOrigin('http://localhost'));

let installed = false;

/** Registra o SSR no cliente da core, depois do middleware de erro: o Set-Cookie sobe até em erros. */
export function installSsrClient() {
    if (installed) return;
    installed = true;
    // no SSR o fetch exige URL absoluta; a origem provisória é trocada pela da requisição recebida
    setServerOrigin();
    apiClient.use(ssrMiddleware);
}
