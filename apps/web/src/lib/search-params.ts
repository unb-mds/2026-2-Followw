import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { useQueryStates } from 'nuqs';
import {
    createLoader,
    createStandardSchemaV1,
    parseAsString,
    parseAsStringLiteral
} from 'nuqs/server';

import { SEARCH_CATEGORIES } from '#/lib/search-categories';

export const searchParsers = {
    q: parseAsString.withDefault(''),
    category: parseAsStringLiteral(SEARCH_CATEGORIES).withDefault('all')
};

export const validateSearch = createStandardSchemaV1(searchParsers, { partialOutput: true });
export const loadSearchParams = createLoader(searchParsers);

// A consulta é texto mesmo quando contém apenas dígitos ou parece JSON.
export function parseRouterSearch(searchStr: string) {
    const search: Record<string, unknown> = { ...defaultParseSearch(searchStr) };
    const q = new URLSearchParams(searchStr).get('q');
    if (q !== null) search.q = q;
    return search;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
    const params = new URLSearchParams(defaultStringifySearch(search));
    if (typeof search.q === 'string') params.set('q', search.q);
    return params.size ? `?${params}` : '';
}

export const useSearchState = () =>
    useQueryStates(searchParsers, { history: 'replace', scroll: false });
