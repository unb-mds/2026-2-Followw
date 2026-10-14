import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { clearSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import { prerequisitesQueryOptions } from '#/queries/prerequisites';

describe('pré-requisitos pessoais', () => {
    let middleware: Middleware;
    let client: QueryClient;
    let requests: Request[];
    beforeEach(() => {
        requests = [];
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return Response.json({ FGA0001: false });
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });
    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
    });

    test('envia apenas os códigos da página, únicos, e o semestre', async () => {
        const result = await client.query(
            prerequisitesQueryOptions('251000000', ['FGA0001', 'MAT0001', 'FGA0001'], '2026.2')
        );
        expect(result).toEqual({ FGA0001: false });
        const url = new URL(requests[0].url);
        expect(url.pathname).toBe('/api/me/prerequisites');
        expect(url.searchParams.getAll('codes')).toEqual(['FGA0001', 'MAT0001']);
        expect(url.searchParams.get('semester')).toBe('2026.2');
    });

    test('visitante e página vazia não buscam histórico', async () => {
        expect(await client.query(prerequisitesQueryOptions(null, ['FGA0001'], '2026.2'))).toEqual(
            {}
        );
        expect(await client.query(prerequisitesQueryOptions('251000000', [], '2026.2'))).toEqual(
            {}
        );
        expect(requests).toHaveLength(0);
    });

    test('trocar conta ou semestre usa cache diferente', () => {
        const first = prerequisitesQueryOptions('251000000', ['FGA0001'], '2026.2').queryKey;
        expect(prerequisitesQueryOptions('251000001', ['FGA0001'], '2026.2').queryKey).not.toEqual(
            first
        );
        expect(prerequisitesQueryOptions('251000000', ['FGA0001'], '2026.1').queryKey).not.toEqual(
            first
        );
    });

    test('logout elimina a avaliação pessoal do cache', async () => {
        const options = prerequisitesQueryOptions('251000000', ['FGA0001'], '2026.2');
        await client.query(options);
        await clearSession(client);
        expect(client.getQueryData(options.queryKey)).toBeUndefined();
    });
});
