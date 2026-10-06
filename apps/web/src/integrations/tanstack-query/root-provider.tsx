import { QueryCache, QueryClient, environmentManager, onlineManager } from '@tanstack/react-query';

import { PERSIST_MAX_AGE } from '#/integrations/tanstack-query/cache-age.ts';
import { clearSession } from '#/queries/auth.ts';
import { ApiError } from '#/queries/errors.ts';

export function getContext() {
    const isServer = environmentManager.isServer();
    const queryClient: QueryClient = new QueryClient({
        queryCache: new QueryCache({
            // sessão expirou enquanto o /me ainda estava em cache
            onError: (error) => {
                if (error instanceof ApiError && error.isUnauthorized)
                    void clearSession(queryClient);
            }
        }),
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                gcTime: isServer ? undefined : PERSIST_MAX_AGE,
                networkMode: 'offlineFirst',
                retry: (failureCount, error) =>
                    !isServer &&
                    onlineManager.isOnline() &&
                    !(error instanceof ApiError && error.status < 500) &&
                    failureCount < 2
            },
            mutations: { networkMode: 'always' }
        }
    });

    return {
        queryClient
    };
}
export default function TanstackQueryProvider() {}
