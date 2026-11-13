import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type SearchResult = components['schemas']['SearchResult'];
export type SearchType = components['schemas']['SearchType'];

export const searchQueryOptions = (q: string, type?: SearchType[]) =>
    api.queryOptions('get', '/public/search', { params: { query: { q, type } } });
