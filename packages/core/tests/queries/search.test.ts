import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SearchResult } from '../../src/queries/search.ts';

import {
    hasSearchResults,
    searchQueryOptions,
    seedCategoryPage
} from '../../src/queries/search.ts';

const page = { items: [], total: 0, page: 1, page_size: 10 };
const empty: SearchResult = { subjects: null, courses: null, professors: null };

describe('hasSearchResults', () => {
    test('sem resposta ou com páginas vazias não há resultado', () => {
        expect(hasSearchResults(undefined)).toBe(false);
        expect(hasSearchResults({ ...empty, courses: page, professors: page })).toBe(false);
    });

    test('matérias contam pelo total da busca', () => {
        expect(hasSearchResults({ ...empty, subjects: { ...page, total: 2 } })).toBe(true);
    });
});

describe('seedCategoryPage', () => {
    test('a prévia da busca geral vira a primeira página da aba', () => {
        const client = new QueryClient();
        const general = searchQueryOptions('ana').queryKey;
        const professors = { ...page, total: 1 };
        client.setQueryData(general, { ...empty, professors });

        seedCategoryPage(client, 'ana', general, 'professors');

        const tab = searchQueryOptions('ana', ['professors']).queryKey;
        expect(client.getQueryData(tab)).toEqual({ ...empty, professors });
    });

    test('não sobrescreve a aba que já foi carregada', () => {
        const client = new QueryClient();
        const general = searchQueryOptions('ana').queryKey;
        const tab = searchQueryOptions('ana', ['courses']).queryKey;
        const loaded = { ...empty, courses: { ...page, total: 9 } };
        client.setQueryData(general, { ...empty, courses: { ...page, total: 1 } });
        client.setQueryData(tab, loaded);

        seedCategoryPage(client, 'ana', general, 'courses');

        expect(client.getQueryData(tab)).toEqual(loaded);
    });
});
