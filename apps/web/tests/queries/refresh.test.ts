import { QueryClient, queryOptions } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import createClient from 'openapi-fetch';
import createQueryHooks from 'openapi-react-query';

import type { paths } from '#/queries/schema.gen.ts';

import { refreshQuery } from '#/queries/refresh.ts';

function apiWith(requests: Request[]) {
    const client = createClient<paths>({
        baseUrl: 'http://api.test',
        fetch: async (request) => {
            requests.push(request);
            return Response.json([]);
        }
    });
    return createQueryHooks(client);
}

describe('refreshQuery', () => {
    test('pede à API para ignorar o cache e grava na mesma queryKey', async () => {
        const requests: Request[] = [];
        const options = apiWith(requests).queryOptions('get', '/classrooms');
        const queryClient = new QueryClient();

        await queryClient.query(options);
        await refreshQuery(queryClient, options);

        expect(requests).toHaveLength(2);
        const [normal, fresh] = requests;
        expect(normal.cache).toBe('default');
        expect(normal.headers.get('cache-control')).toBeNull();
        // Fora do navegador (como no bun test) o header vai direto, no lugar do `cache: 'reload'`.
        expect(fresh.headers.get('cache-control')).toBe('no-cache');
        const cached: unknown = queryClient.getQueryData(options.queryKey);
        expect(cached).toEqual([]);
    });

    test('ignora o staleTime e mantém os parâmetros da query', async () => {
        const requests: Request[] = [];
        const options = apiWith(requests).queryOptions('get', '/classrooms', {
            params: { query: { semester: 'all' } }
        });
        const queryClient = new QueryClient({
            defaultOptions: { queries: { staleTime: Infinity } }
        });
        queryClient.setQueryData(options.queryKey, []);

        await refreshQuery(queryClient, options);

        expect(requests).toHaveLength(1);
        expect(new URL(requests[0].url).searchParams.get('semester')).toBe('all');
    });

    test('usa o queryFn da própria query', async () => {
        const options = queryOptions({
            queryKey: ['get', '/me'] as readonly [string, string, object?],
            queryFn: async ({ queryKey }) => queryKey
        });
        const queryClient = new QueryClient();

        const data = await refreshQuery(queryClient, options);

        expect(data[2]).toBeDefined();
        const cached: unknown = queryClient.getQueryData(options.queryKey);
        expect(cached).toBe(data);
    });
});
