import { queryOptions } from '@tanstack/react-query';

import { apiClient } from '#/queries/client.ts';
import { ApiError } from '#/queries/errors.ts';

export const meQueryOptions = queryOptions({
    queryKey: ['get', '/me'],
    queryFn: async ({ signal }) => {
        try {
            const { data } = await apiClient.GET('/me', { signal });
            return data ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) return null;
            throw error;
        }
    }
});
