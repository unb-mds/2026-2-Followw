import type { QueryClient } from '@tanstack/react-query';

import type { components } from './schema.gen.ts';

import { searchTypes } from '../lib/search-categories.ts';
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

export function hasSearchResults(data: SearchResult | undefined) {
    if (!data) return false;
    return Boolean(
        data.courses?.items.length || data.professors?.items.length || data.subjects?.total
    );
}

/** Reaproveita a prévia da busca geral como primeira página da aba de cursos ou docentes. */
export function seedCategoryPage(
    client: QueryClient,
    text: string,
    queryKey: readonly unknown[],
    category: 'courses' | 'professors'
) {
    const data = client.getQueryData<SearchResult>(queryKey)?.[category];
    if (!data) return;
    client.setQueryData(
        searchQueryOptions(text, searchTypes[category]).queryKey,
        (old) =>
            old ?? {
                subjects: null,
                courses: null,
                professors: null,
                [category]: data
            }
    );
}
