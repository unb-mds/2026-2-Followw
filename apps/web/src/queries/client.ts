import { createIsomorphicFn } from '@tanstack/react-start';
import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '#/queries/schema.gen.ts';

import { toApiError } from '#/queries/errors.ts';

// a API fica em /api da mesma origem; no SSR o fetch exige URL absoluta, e a origem provisória é
// trocada pela da requisição recebida (veja `ssrMiddleware`)
const baseUrl = createIsomorphicFn()
    .client(() => '/api')
    .server(() => 'http://localhost/api')();

const getSsrHeaders = createIsomorphicFn()
    .client(() => new Headers())
    .server(async () => {
        try {
            const { getRequest } = await import('@tanstack/react-start/server');
            const { clientIpHeaders } = await import('#/queries/client-ip.server');
            const incoming = getRequest();
            const headers = clientIpHeaders(incoming);
            const cookie = incoming.headers.get('cookie');
            if (cookie) headers.set('cookie', cookie);
            return headers;
        } catch {
            return new Headers();
        }
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
