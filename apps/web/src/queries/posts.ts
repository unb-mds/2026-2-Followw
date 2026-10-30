import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type ClassroomNews = components['schemas']['ClassroomNews'];

export const latestNewsQueryOptions = api.queryOptions(
    'get',
    '/posts/news',
    {},
    {
        refetchInterval: (query) => (query.state.data?.updating ? 5000 : false)
    }
);
