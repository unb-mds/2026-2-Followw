import type { components } from '#/queries/schema.gen';

import { api } from '#/queries/api';

export type SearchResult = components['schemas']['SearchResult'];
export type SearchType = components['schemas']['SearchType'];

export const searchQueryOptions = (q: string, type?: SearchType[]) =>
    api.queryOptions('get', '/public/search', { params: { query: { q, type } } });
