import type { paths } from '@followw/core/queries/schema.gen.ts';

import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import createClient from 'openapi-fetch';
import createQueryHooks from 'openapi-react-query';

import { refreshQuery } from '#/queries/refresh.ts';

function apiWith(requests: Request[], response = Response.json([])) {
    const client = createClient<paths>({
        baseUrl: 'http://api.test',
        fetch: async (request) => {
            requests.push(request);
            return response.clone();
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

    test('não repete a requisição do extrato quando o refresh desativa retentativas', async () => {
        const requests: Request[] = [];
        const error = { detail: 'SIGAA indisponível' };
        const options = apiWith(requests, Response.json(error, { status: 503 })).queryOptions(
            'get',
            '/me/ru-statement'
        );
        const client = new QueryClient({
            defaultOptions: { queries: { retry: 2, retryDelay: 0 } }
        });

        const failure = await refreshQuery(client, options, { retry: false }).catch(
            (reason: unknown) => reason
        );
        expect(failure).toEqual(error);
        expect(requests).toHaveLength(1);
    });
});
