import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { loadQuery } from '#/queries/load';

const queryKey = ['get', '/classrooms'];

describe('loadQuery', () => {
    test('sem cache espera a rede', async () => {
        const client = new QueryClient();
        expect(await loadQuery(client, { queryKey, queryFn: async () => 'rede' })).toBe('rede');
    });

    test('com cache velho resolve na hora e revalida em segundo plano', async () => {
        const client = new QueryClient();
        client.setQueryData(queryKey, 'salvo', { updatedAt: 0 });
        const network = Promise.withResolvers<string>();

        expect(await loadQuery(client, { queryKey, queryFn: () => network.promise })).toBe('salvo');

        network.resolve('novo');
        await network.promise;
        await Promise.resolve();
        expect(client.getQueryData<string>(queryKey)).toBe('novo');
    });

    test('falha ao revalidar mantém o dado salvo sem rejeitar', async () => {
        const client = new QueryClient();
        client.setQueryData(queryKey, 'salvo', { updatedAt: 0 });

        const data = await loadQuery(client, {
            queryKey,
            queryFn: (): Promise<string> => Promise.reject(new TypeError('offline'))
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(data).toBe('salvo');
        expect(client.getQueryData<string>(queryKey)).toBe('salvo');
    });
});
