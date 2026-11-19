import { SEARCH_CATEGORIES } from '@followw/core/lib/search-categories.ts';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { useQueryStates } from 'nuqs';
import {
    createLoader,
    createStandardSchemaV1,
    createParser,
    parseAsBoolean,
    parseAsString,
    parseAsStringLiteral
} from 'nuqs/server';

export const workloadFilter = createParser<number | '180+'>({
    parse(value) {
        if (value === '180+') return value;
        if (!/^[1-9]\d*$/.test(value)) return null;
        const hours = Number(value);
        if (hours > 960) return null;
        return hours >= 180 ? '180+' : hours;
    },
    serialize: String
});

export const searchParsers = {
    hideConflicts: parseAsBoolean.withDefault(false),
    freeModules: parseAsBoolean.withDefault(false),
    electives: parseAsBoolean.withDefault(false),
    days: parseAsString.withDefault(''),
    start: parseAsString.withDefault(''),
    unit: parseAsString.withDefault(''),
    hours: workloadFilter,
    q: parseAsString.withDefault(''),
    category: parseAsStringLiteral(SEARCH_CATEGORIES).withDefault('all')
};

export const validateSearch = createStandardSchemaV1(searchParsers, { partialOutput: true });
export const loadSearchParams = createLoader(searchParsers);

// A consulta é texto mesmo quando contém apenas dígitos ou parece JSON.
export function parseRouterSearch(searchStr: string) {
    const search: Record<string, unknown> = { ...defaultParseSearch(searchStr) };
    const params = new URLSearchParams(searchStr);
    for (const key of ['q', 'days', 'unit']) {
        const value = params.get(key);
        if (value !== null) search[key] = value;
    }
    return search;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
    const params = new URLSearchParams(defaultStringifySearch(search));
    for (const key of ['q', 'days', 'unit']) {
        if (typeof search[key] === 'string') params.set(key, search[key]);
    }
    return params.size ? `?${params}` : '';
}

export const useSearchState = () =>
    useQueryStates(searchParsers, { history: 'replace', scroll: false });
