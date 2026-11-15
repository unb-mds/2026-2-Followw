import { queryOptions } from '@tanstack/react-query';

import type { components } from './schema.gen.ts';

import { api } from './api.ts';
import { ApiError } from './errors.ts';

export type UserProfile = components['schemas']['UserProfile'];

const { queryKey, queryFn } = api.queryOptions('get', '/me');

export const meQueryOptions = queryOptions({
    queryKey,
    queryFn: async (context) => {
        try {
            return (await queryFn(context)) ?? null;
        } catch (error) {
            if (error instanceof ApiError && error.isUnauthorized) {
                return null;
            }
            throw error;
        }
    }
});
