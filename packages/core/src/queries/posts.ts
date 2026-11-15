import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type ClassroomNews = components['schemas']['ClassroomNews'];

export const latestNewsQueryOptions = api.queryOptions(
    'get',
    '/posts/news',
    {},
    {
        refetchInterval: (query) => (query.state.data?.updating ? 5000 : false)
    }
);
