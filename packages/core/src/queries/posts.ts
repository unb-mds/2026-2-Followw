import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type FeedPost = components['schemas']['FeedPost'];

export const latestPostsQueryOptions = api.queryOptions(
    'get',
    '/posts',
    {},
    {
        refetchInterval: (query) => (query.state.data?.updating ? 5000 : false)
    }
);
