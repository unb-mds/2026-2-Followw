import { queryOptions } from '@tanstack/react-query';

import { api } from '#/queries/api.ts';
import { ApiError } from '#/queries/errors.ts';

const { queryKey, queryFn } = api.queryOptions('get', '/me');

export const meQueryOptions = queryOptions({
    queryKey,
    queryFn: async (context) => {
        try {
            return (await queryFn(context)) ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) return null;
            throw error;
        }
    }
});
