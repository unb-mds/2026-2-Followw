import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';
import { useQueryStates } from 'nuqs';
import {
    createLoader,
    createStandardSchemaV1,
    parseAsString,
    parseAsStringLiteral
} from 'nuqs/server';

import { TIPOS } from '#/queries/subjects';

export const searchParsers = {
    busca: parseAsString.withDefault(''),
    tipo: parseAsStringLiteral(TIPOS).withDefault('Todas')
};

export const validateSearch = createStandardSchemaV1(searchParsers, { partialOutput: true });
export const loadSearchParams = createLoader(searchParsers);

// A consulta é texto mesmo quando contém apenas dígitos ou parece JSON.
export function parseRouterSearch(searchStr: string) {
    const search: Record<string, unknown> = { ...defaultParseSearch(searchStr) };
    const busca = new URLSearchParams(searchStr).get('busca');
    if (busca !== null) search.busca = busca;
    return search;
}

export function stringifyRouterSearch(search: Record<string, unknown>) {
    const params = new URLSearchParams(defaultStringifySearch(search));
    if (typeof search.busca === 'string') params.set('busca', search.busca);
    return params.size ? `?${params}` : '';
}

export const useSearchState = () =>
    useQueryStates(searchParsers, { history: 'replace', scroll: false });
