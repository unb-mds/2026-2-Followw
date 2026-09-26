import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '#/queries/errors.ts';

export function getContext() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 60_000,
                // 4xx não melhora tentando de novo
                retry: (failureCount, error) =>
                    !(error instanceof ApiError && error.status < 500) && failureCount < 2
            }
        }
    });

    return {
        queryClient
    };
}
export default function TanstackQueryProvider() {}
