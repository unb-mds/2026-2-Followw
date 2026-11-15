import type { components } from '@followw/core/queries/schema.gen.ts';
import type { QueryClient } from '@tanstack/react-query';

import { meQueryOptions as profileQueryOptions } from '@followw/core/queries/me.ts';
import { queryOptions } from '@tanstack/react-query';

import { ssrRequest } from '#/queries/ssr.ts';

export type UserProfile = components['schemas']['UserProfile'];

const { queryKey, queryFn } = profileQueryOptions;

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
        const user = await queryFn!(context);
        if (!user && context.client.getQueryData(queryKey)) {
            const { clearSession } = await import('#/queries/auth');
            await clearSession(context.client);
        }
        return user;
    }
});
