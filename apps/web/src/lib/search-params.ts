import { SEARCH_CATEGORIES } from '@followw/core/lib/search-categories.ts';
import {
    type subjectFilterKeys,
    startTimes,
    type Workload,
    workloads
} from '@followw/core/lib/subject-filters.ts';
import { SUBJECT_KINDS } from '@followw/core/queries/subjects.ts';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { useQueryStates } from 'nuqs';
import {
    createLoader,
    createParser,
    createStandardSchemaV1,
    type inferParserType,
    parseAsNativeArrayOf,
    parseAsBoolean,
    parseAsString,
    parseAsStringLiteral
} from 'nuqs/server';

import { AUTHORIZATION_SEARCH_KEYS } from '#/lib/oauth-request';

const workloadFilter = createParser<Workload>({
    parse: (value) =>
        value === '90+' ? value : (workloads.find((hours) => String(hours) === value) ?? null),
    serialize: String
});

// Dias de segunda (0) a domingo (6), sem repetição e em ordem, como a API espera.
const weekdaysFilter = createParser<string>({
    parse: (value) => (/^[0-6]{1,7}$/.test(value) ? [...new Set(value)].toSorted().join('') : null),
    serialize: String
});

export const searchParsers = {
    hideUnavailable: parseAsBoolean.withDefault(false),
    hideConflicts: parseAsBoolean.withDefault(false),
    kind: parseAsNativeArrayOf(parseAsStringLiteral(SUBJECT_KINDS)),
    days: weekdaysFilter.withDefault(''),
    start: parseAsNativeArrayOf(parseAsStringLiteral(startTimes)),
    hours: parseAsNativeArrayOf(workloadFilter),
    q: parseAsString.withDefault(''),
    category: parseAsStringLiteral(SEARCH_CATEGORIES).withDefault('all')
};

export const validateSearch = createStandardSchemaV1(searchParsers, { partialOutput: true });
export const loadSearchParams = createLoader(searchParsers);
export type SearchParams = inferParserType<typeof searchParsers>;

export const clearedSubjectFilters = {
    kind: null,
    days: null,
    start: null,
    hours: null,
    hideConflicts: null,
    hideUnavailable: null
} satisfies Record<(typeof subjectFilterKeys)[number], null>;

// Valores que o Router leria como JSON (números, listas) continuam texto.
const textKeys = ['q', 'days', 'returnTo'] as const;
// OAuth usa valores opacos: parâmetros repetidos precisam chegar intactos para serem rejeitados.
const opaqueKeys = AUTHORIZATION_SEARCH_KEYS;
const arrayKeys = ['kind', 'start', 'hours'] as const;

export function parseRouterSearch(searchStr: string) {
    const search: Record<string, unknown> = { ...defaultParseSearch(searchStr) };
    const params = new URLSearchParams(searchStr);
    for (const key of textKeys) {
        const value = params.get(key);
        if (value !== null) search[key] = value;
    }
    for (const key of opaqueKeys) {
        const values = params.getAll(key);
        if (values.length) search[key] = values.length === 1 ? values[0] : values;
    }
    for (const key of arrayKeys) {
        if (params.has(key)) search[key] = searchParsers[key].parse(params.getAll(key));
    }
    return search;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
    const params = new URLSearchParams(defaultStringifySearch(search));
    for (const key of textKeys) {
        const value = search[key];
        if (typeof value === 'string') params.set(key, value);
    }
    for (const key of opaqueKeys) {
        const value = search[key];
        if (typeof value === 'string') params.set(key, value);
        else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
            params.delete(key);
            for (const item of value) params.append(key, item);
        }
    }
    for (const key of arrayKeys) {
        const values = search[key];
        if (!Array.isArray(values)) continue;
        params.delete(key);
        for (const value of values) params.append(key, String(value));
    }
    return params.size ? `?${params}` : '';
}

export const useSearchState = () =>
    useQueryStates(searchParsers, { history: 'replace', scroll: false });
