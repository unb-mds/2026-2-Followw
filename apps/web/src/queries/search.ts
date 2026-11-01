import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type SearchResult = components['schemas']['SearchResult'];

export const searchQueryOptions = (q: string) =>
    api.queryOptions('get', '/public/search', { params: { query: { q } } });
