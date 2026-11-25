import { SEARCH_CATEGORIES } from '@followw/core/lib/search-categories.ts';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { useQueryStates } from 'nuqs';
import {
    createLoader,
    createStandardSchemaV1,
    parseAsString,
    parseAsStringLiteral
} from 'nuqs/server';

import { AUTHORIZATION_SEARCH_KEYS } from '#/lib/oauth-request';

export const searchParsers = {
    q: parseAsString.withDefault(''),
    category: parseAsStringLiteral(SEARCH_CATEGORIES).withDefault('all')
};

export const validateSearch = createStandardSchemaV1(searchParsers, { partialOutput: true });
export const loadSearchParams = createLoader(searchParsers);

// OAuth usa valores opacos: zeros iniciais, JSON e parâmetros repetidos não podem mudar.
const TEXT_SEARCH_KEYS = ['q', 'returnTo', ...AUTHORIZATION_SEARCH_KEYS];

export function parseRouterSearch(searchStr: string) {
    const search: Record<string, unknown> = { ...defaultParseSearch(searchStr) };
    const params = new URLSearchParams(searchStr);
    for (const key of TEXT_SEARCH_KEYS) {
        const values = params.getAll(key);
        if (values.length) search[key] = values.length === 1 ? values[0] : values;
    }
    return search;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
    const params = new URLSearchParams(defaultStringifySearch(search));
    for (const key of TEXT_SEARCH_KEYS) {
        const value = search[key];
        if (typeof value === 'string') params.set(key, value);
        else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
            params.delete(key);
            for (const item of value) params.append(key, item);
        }
    }
    return params.size ? `?${params}` : '';
}

export const useSearchState = () =>
    useQueryStates(searchParsers, { history: 'replace', scroll: false });
