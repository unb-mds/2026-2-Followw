import { queryOptions } from '@tanstack/react-query';

import type { components } from './schema.gen.ts';

import { api } from './api.ts';
import { ApiError } from './errors.ts';

export type AccountData = components['schemas']['AccountData'];

const { queryKey, queryFn } = api.queryOptions('get', '/me/data');

export const accountDataQueryOptions = queryOptions({
    queryKey,
    retry: false,
    staleTime: 0,
    meta: { persist: false },
    queryFn: async (context) => {
        try {
            return (await queryFn(context)) ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) return null;
            throw error;
        }
    }
});
