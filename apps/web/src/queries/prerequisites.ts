import { queryOptions } from '@tanstack/react-query';

import { api } from '#/queries/api';
import { ApiError } from '#/queries/errors';

export function prerequisitesQueryOptions(
    registration: string | null,
    codes: string[],
    semester: string | null
) {
    const options = api.queryOptions('get', '/me/prerequisites', {
        params: { query: { codes: [...new Set(codes)].toSorted(), semester: semester ?? '' } }
    });
    return queryOptions({
        queryKey: [...options.queryKey, registration] as const,
        queryFn: async (context): Promise<Record<string, boolean | null>> => {
            if (!registration || !codes.length || !semester) return {};
            try {
                return (await options.queryFn({ ...context, queryKey: options.queryKey })) ?? {};
            } catch (error) {
                if (!(error instanceof ApiError && error.isUnauthorized)) throw error;
                return {};
            }
        }
    });
}
