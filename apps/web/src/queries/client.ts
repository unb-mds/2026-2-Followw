import { createIsomorphicFn } from '@tanstack/react-start';
import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '#/queries/schema.gen.ts';

import { toApiError } from '#/queries/errors.ts';

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const getSsrCookie = createIsomorphicFn()
    .client(() => undefined)
    .server(async () => {
        try {
            const { getRequestHeader } = await import('@tanstack/react-start/server');
            return getRequestHeader('cookie');
        } catch {
            return undefined;
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

const ssrCookiesMiddleware: Middleware = {
    async onRequest({ request }) {
        const cookie = await getSsrCookie();
        if (cookie) request.headers.set('cookie', cookie);
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
apiClient.use(ssrCookiesMiddleware);
