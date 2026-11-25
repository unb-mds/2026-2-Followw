import type { QueryClient } from '@tanstack/react-query';

import { loadQuery } from '@followw/core/queries/load.ts';
import { redirect } from '@tanstack/react-router';

import { meQueryOptions } from '#/queries/me';

/** Para loaders de páginas com login: a conta, ou o login voltando para `returnTo`. */
export async function requireUser(queryClient: QueryClient, returnTo: string) {
    const user = await loadQuery(queryClient, meQueryOptions);
    if (!user) throw redirect({ to: '/login', search: { returnTo } });
    return user;
}
