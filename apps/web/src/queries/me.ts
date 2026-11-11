import type { QueryClient } from '@tanstack/react-query';

import { queryOptions } from '@tanstack/react-query';

import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api.ts';
import { ApiError } from '#/queries/errors.ts';
import { ssrRequest } from '#/queries/ssr.ts';

export type UserProfile = components['schemas']['UserProfile'];

const { queryKey, queryFn } = api.queryOptions('get', '/me');

// mesmo nome de api/cookies.py
const SESSION_COOKIE = 'refresh_token';

async function hasNoSessionOnServer() {
    const ssr = await ssrRequest();
    return ssr && !ssr.getCookie(SESSION_COOKIE);
}

export async function seedAnonymousProfile(client: QueryClient) {
    if (await hasNoSessionOnServer()) client.setQueryData(queryKey, null);
}

export const meQueryOptions = queryOptions({
    queryKey,
    queryFn: async (context) => {
        // no SSR, sem o cookie da sessão não há conta para consultar
        if (await hasNoSessionOnServer()) return null;
        try {
            return (await queryFn(context)) ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) return null;
            throw error;
        }
    }
});
