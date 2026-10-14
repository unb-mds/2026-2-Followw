import {
    MutationCache,
    QueryCache,
    QueryClient,
    environmentManager,
    onlineManager
} from '@tanstack/react-query';

import { PERSIST_MAX_AGE } from '#/integrations/offline/storage.ts';
import { clearSession } from '#/queries/auth.ts';
import { ApiError } from '#/queries/errors.ts';

export function getContext() {
    const isServer = environmentManager.isServer();
    // sessão expirou enquanto o /me ainda estava em cache
    const onError = (error: Error) => {
        if (error instanceof ApiError && error.isUnauthorized) void clearSession(queryClient);
    };
    const queryClient: QueryClient = new QueryClient({
        queryCache: new QueryCache({ onError }),
        mutationCache: new MutationCache({ onError }),
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                gcTime: isServer ? undefined : PERSIST_MAX_AGE,
                networkMode: 'always',
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
