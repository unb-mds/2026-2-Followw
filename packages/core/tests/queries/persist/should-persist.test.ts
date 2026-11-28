import { dehydrate, hydrate, QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { PERSIST_MAX_AGE, shouldPersistQuery } from '../../../src/queries/persist.ts';
import { recommendationsQueryOptions } from '../../../src/queries/recommendations.ts';
import { credentialsQueryOptions } from '../../../src/queries/restaurant-account.ts';

const queryAt = (updatedAt: number) => {
    const client = new QueryClient();
    client.setQueryData(['dado'], 1, { updatedAt });
    return client.getQueryCache().find({ queryKey: ['dado'] })!;
};

describe('shouldPersistQuery', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');

    test('salva a query atualizada dentro da validade', () => {
        expect(shouldPersistQuery(queryAt(now - PERSIST_MAX_AGE + 1), now)).toBe(true);
    });

    test('descarta a query sem atualização há mais que a validade', () => {
        expect(shouldPersistQuery(queryAt(now - PERSIST_MAX_AGE), now)).toBe(false);
    });

    test('não salva query sem dado', () => {
        const client = new QueryClient();
        client.getQueryCache().build(client, { queryKey: ['vazia'] });
        const query = client.getQueryCache().find({ queryKey: ['vazia'] })!;
        expect(shouldPersistQuery(query, now)).toBe(false);
    });

    test('consultas com `meta.persist: false` ficam só na memória', () => {
        const client = new QueryClient();
        client.getQueryCache().build(client, recommendationsQueryOptions());
        client.setQueryData(recommendationsQueryOptions().queryKey, { items: [] });
        client.setQueryData(['get', '/public/subjects'], []);
        const find = (queryKey: readonly unknown[]) => client.getQueryCache().find({ queryKey })!;
        expect(shouldPersistQuery(find(recommendationsQueryOptions().queryKey))).toBe(false);
        expect(shouldPersistQuery(find(['get', '/public/subjects']))).toBe(true);
    });

    test('restaura a última carteirinha mesmo depois de uma atualização falhar', async () => {
        const client = new QueryClient();
        const { queryKey } = credentialsQueryOptions('251000000');
        const card = { token: 'qr-local', valid_until: '2099-12-01' };
        client.setQueryData(queryKey, card);
        const error = new TypeError('Sem conexão');
        const failure = await client
            .query({ queryKey, queryFn: () => Promise.reject(error), retry: false })
            .catch((reason: unknown) => reason);
        expect(failure).toBe(error);
        expect(client.getQueryState(queryKey)?.status).toBe('error');

        const restored = new QueryClient();
        hydrate(restored, dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }));
        expect(restored.getQueryData(queryKey)).toEqual(card);
    });

    test('mantém os dados da página consultada após uma falha de rede', async () => {
        const client = new QueryClient();
        const queryKey = ['get', '/classrooms'];
        const classrooms = [{ id: 'turma-1' }];
        client.setQueryData(queryKey, classrooms);
        await client
            .query({ queryKey, queryFn: () => Promise.reject(new TypeError()), retry: false })
            .catch(() => null);

        const restored = new QueryClient();
        hydrate(restored, dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }));
        expect(restored.getQueryData(queryKey)).toEqual(classrooms);
    });
});
