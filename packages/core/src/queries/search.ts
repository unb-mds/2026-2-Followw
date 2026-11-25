import type { components } from './schema.gen.ts';

import { api } from './api.ts';

export type SearchResult = components['schemas']['SearchResult'];
export type SearchType = components['schemas']['SearchType'];

/** Com `available`, as matérias só trazem turmas com vaga e pré-requisitos cumpridos. */
export function searchQueryOptions(q: string, type?: SearchType[], available = false) {
    const subjects = !type || type.includes('subjects');
    return api.queryOptions('get', '/public/search', {
        params: {
            query: {
                q,
                type,
                offered: subjects || undefined,
                ...(subjects && available && { available })
            }
        }
    });
}
