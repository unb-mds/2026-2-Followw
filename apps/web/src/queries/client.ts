import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from '#/queries/schema.gen.ts';

import { toApiError } from '#/queries/errors.ts';

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

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
