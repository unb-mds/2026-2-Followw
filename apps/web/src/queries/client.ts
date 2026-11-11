import { createIsomorphicFn } from '@tanstack/react-start';
import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '#/queries/schema.gen.ts';
import type { SsrServer } from '#/queries/ssr.ts';

import { toApiError } from '#/queries/errors.ts';
import { ssrRequest } from '#/queries/ssr.ts';

// a API fica em /api da mesma origem; no SSR o fetch exige URL absoluta, e a origem provisória é
// trocada pela da requisição recebida (veja `ssrMiddleware`)
const baseUrl = createIsomorphicFn()
    .client(() => '/api')
    .server(() => 'http://localhost/api')();

// a assinatura do IP é opcional: falhar aqui não pode derrubar a sessão
const clientIpHeaders = createIsomorphicFn()
    .client(async (_request: Request) => new Headers())
    .server(async (request: Request) =>
        import('#/queries/client-ip.server').then((module) => module.clientIpHeaders(request))
    );

async function getSsrHeaders(server: SsrServer) {
    const incoming = server.getRequest();
    const headers = await clientIpHeaders(incoming).catch(() => new Headers());
    const cookie = incoming.headers.get('cookie');
    if (cookie) headers.set('cookie', cookie);
    return headers;
}

const ssrMiddleware: Middleware = {
    async onRequest({ request: original }) {
        const server = await ssrRequest();
        if (!server) return original;
        const { pathname, search } = new URL(original.url);
        const request = new Request(new URL(pathname + search, server.getRequestUrl()), original);
        (await getSsrHeaders(server)).forEach((value, name) => request.headers.set(name, value));
        return request;
    },
    async onResponse({ response }) {
        const cookies = response.headers.getSetCookie();
        if (cookies.length) (await ssrRequest())?.setResponseHeader('set-cookie', cookies);
    }
};

const errorHandlingMiddleware: Middleware = {
    async onResponse({ response }) {
        if (!response.ok) {
            const body = await response
                .clone()
                .json()
                .catch(() => null);
            throw toApiError(response.status, body);
        }
    }
};

export const apiClient = createClient<paths>({
    baseUrl,
    credentials: 'include'
});

apiClient.use(errorHandlingMiddleware);
apiClient.use(ssrMiddleware);
