import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { meQueryOptions } from '#/queries/me';

describe('usuário logado', () => {
    let middleware: Middleware;
    let response: () => Response | Error;
    let client: QueryClient;

    beforeEach(() => {
        middleware = {
            onRequest: () => {
                const result = response();
                if (result instanceof Error) throw result;
                return result;
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });

    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
    });

    test('devolve o perfil da API', async () => {
        response = () => Response.json({ name: 'Fulano', registration: '251000000' });

        expect(await client.query(meQueryOptions)).toMatchObject({ registration: '251000000' });
    });

    test('sem sessão resolve null em vez de erro', async () => {
        response = () => new ApiError(401, 'Not authenticated');

        expect(await client.query(meQueryOptions)).toBeNull();
    });

    test.each([new ApiError(502, 'SIGAA is unavailable'), new TypeError('Failed to fetch')])(
        'falha %p não é confundida com deslogado',
        async (error) => {
            response = () => error;

            let reason: unknown;
            try {
                await client.query(meQueryOptions);
            } catch (caught) {
                reason = caught;
            }

            expect(reason).toBe(error);
        }
    );
});
