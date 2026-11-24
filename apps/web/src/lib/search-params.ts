import { SCHEDULE_BLOCKS } from '@followw/core/lib/schedule.ts';
import { SEARCH_CATEGORIES } from '@followw/core/lib/search-categories.ts';
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { useQueryStates } from 'nuqs';
import {
    createLoader,
    createStandardSchemaV1,
    createParser,
    parseAsNativeArrayOf,
    parseAsBoolean,
    parseAsString,
    parseAsStringLiteral
} from 'nuqs/server';

export const startTimes = SCHEDULE_BLOCKS.map((block) => block[0][0]);
export const workloads = [15, 30, 45, 60, 75] as const;

const workloadFilter = createParser<number | '90+'>({
    parse: (value) =>
        value === '90+' ? value : (workloads.find((hours) => String(hours) === value) ?? null),
    serialize: String
});

/** O início de um bloco inclui os horários nele. */
export const blockStarts = (start: string) =>
    SCHEDULE_BLOCKS.find((block) => block[0][0] === start)?.map(([time]) => time) ?? [start];

export const searchParsers = {
    hideUnavailable: parseAsBoolean.withDefault(false),
    hideConflicts: parseAsBoolean.withDefault(false),
    freeModules: parseAsBoolean.withDefault(false),
    electives: parseAsBoolean.withDefault(false),
    mandatory: parseAsBoolean.withDefault(false),
    days: parseAsString.withDefault(''),
    unit: parseAsString.withDefault(''),
    start: parseAsNativeArrayOf(parseAsStringLiteral(startTimes)),
    hours: parseAsNativeArrayOf(workloadFilter),
    q: parseAsString.withDefault(''),
    category: parseAsStringLiteral(SEARCH_CATEGORIES).withDefault('all')
};

export const validateSearch = createStandardSchemaV1(searchParsers, { partialOutput: true });
export const loadSearchParams = createLoader(searchParsers);
const arrayKeys = ['start', 'hours'] as const;

// A consulta é texto mesmo quando contém apenas dígitos ou parece JSON.
export function parseRouterSearch(searchStr: string) {
    const search: Record<string, unknown> = { ...defaultParseSearch(searchStr) };
    const params = new URLSearchParams(searchStr);
    for (const key of ['q', 'days', 'unit']) {
        const value = params.get(key);
        if (value !== null) search[key] = value;
    }
    for (const key of arrayKeys) {
        if (params.has(key)) search[key] = searchParsers[key].parse(params.getAll(key));
    }
    return search;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
    const params = new URLSearchParams(defaultStringifySearch(search));
    for (const key of ['q', 'days', 'unit']) {
        if (typeof search[key] === 'string') params.set(key, search[key]);
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
