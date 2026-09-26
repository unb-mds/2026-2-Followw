import { QueryCache, QueryClient, environmentManager } from '@tanstack/react-query';

import { clearSession } from '#/queries/auth.ts';
import { ApiError } from '#/queries/errors.ts';

export function getContext() {
    const queryClient: QueryClient = new QueryClient({
        queryCache: new QueryCache({
            // sessão expirou enquanto o /me ainda estava em cache
            onError: (error) => {
                if (error instanceof ApiError && error.isUnauthorized) clearSession(queryClient);
            }
        }),
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                // no SSR falha rápido e deixa o retry pro client; 4xx não melhora tentando de novo
                retry: (failureCount, error) =>
                    !environmentManager.isServer() &&
                    !(error instanceof ApiError && error.status < 500) &&
                    failureCount < 2
            }
        }
    });

    return {
        queryClient
    };
}
export default function TanstackQueryProvider() {}
