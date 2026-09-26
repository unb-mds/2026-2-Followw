import { createIsomorphicFn } from '@tanstack/react-start';
import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '#/queries/schema.gen.ts';

import { toApiError } from '#/queries/errors.ts';

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

let requestCookies: string | undefined;

export function setRequestCookies(cookies: string | undefined) {
    requestCookies = cookies;
}

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

const ssrCookiesMiddleware: Middleware = {
    async onRequest({ request }) {
        if (typeof document === 'undefined') {
            const cookie = requestCookies ?? (await getSsrCookie());
            if (cookie) {
                request.headers.set('cookie', cookie);
            }
        }
        return request;
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

apiClient.use(ssrCookiesMiddleware);
apiClient.use(errorHandlingMiddleware);
