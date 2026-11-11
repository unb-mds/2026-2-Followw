import { queryOptions } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';

import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api.ts';
import { ApiError } from '#/queries/errors.ts';

export type UserProfile = components['schemas']['UserProfile'];

const { queryKey, queryFn } = api.queryOptions('get', '/me');

const hasSessionCookie = createIsomorphicFn()
    .client(() => true)
    .server(async () => {
        const { getCookie } = await import('@tanstack/react-start/server');
        try {
            return Boolean(getCookie('refresh_token'));
        } catch {
            // Consultas fora de uma requisição SSR (por exemplo, testes) usam a API.
            return true;
        }
    });

export const meQueryOptions = queryOptions({
    queryKey,
    queryFn: async (context) => {
        if (!(await hasSessionCookie())) return null;
        try {
            return (await queryFn(context)) ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) return null;
            throw error;
        }
    }
});
