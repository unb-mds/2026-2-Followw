import type { Middleware } from 'openapi-fetch';

import { noop, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { RestaurantStatement, RestaurantCredentials } from '#/queries/restaurant-account';

import { clearSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { refreshQuery } from '#/queries/refresh';
import { credentialsQueryOptions, statementQueryOptions } from '#/queries/restaurant-account';

const registration = '251000000';
const statement: RestaurantStatement = {
    balance: '-1.50',
    group: 2,
    entries: [{ occurred_at: '2026-10-05T12:00:00-03:00', description: 'Almoço', amount: '-5.20' }]
};
const credentials: RestaurantCredentials = {
    token: 'token-da-carteirinha',
    valid_until: '2026-12-01'
};

describe('conta do RU', () => {
    let middleware: Middleware;
    let requests: Request[];
    let response: (request: Request) => Response | Promise<Response>;
    let client: QueryClient;

    beforeEach(() => {
        requests = [];
        response = (request) =>
            Response.json(
                new URL(request.url).pathname === '/api/me/ru-token' ? credentials : statement
            );
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return response(request);
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });

    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
    });

    test('consulta saldo e carteirinha sem mandar a matrícula para a API', async () => {
        expect(await client.query(statementQueryOptions(registration))).toEqual(statement);
        expect(await client.query(credentialsQueryOptions(registration))).toEqual(credentials);
        expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
            '/api/me/ru-statement',
            '/api/me/ru-token'
        ]);
        expect(requests.every((request) => new URL(request.url).search === '')).toBe(true);
    });

    test('isola o cache de cada conta pela matrícula', () => {
        expect(statementQueryOptions(registration).queryKey).not.toEqual(
            statementQueryOptions('outra-matricula').queryKey
        );
        expect(credentialsQueryOptions(registration).queryKey).not.toEqual(
            credentialsQueryOptions('outra-matricula').queryKey
        );
    });

    test('o saldo salvo só é refeito depois de 30 minutos', async () => {
        const { queryKey } = statementQueryOptions(registration);
        client.setQueryData(queryKey, statement, { updatedAt: Date.now() - 29 * 60_000 });
        await client.query(statementQueryOptions(registration));
        expect(requests).toHaveLength(0);

        client.setQueryData(queryKey, statement, { updatedAt: Date.now() - 31 * 60_000 });
        await client.query(statementQueryOptions(registration));
        expect(requests).toHaveLength(1);
    });

    test('a carteirinha salva não é refeita automaticamente', async () => {
        client.setQueryData(credentialsQueryOptions(registration).queryKey, credentials);
        await client.query(credentialsQueryOptions(registration));
        expect(requests).toHaveLength(0);
    });

    test('atualiza pela API pedindo dado novo', async () => {
        client.setQueryData(statementQueryOptions(registration).queryKey, statement);
        const fresh = { ...statement, balance: '30.00' };
        response = () => Response.json(fresh);
        await refreshQuery(client, statementQueryOptions(registration));
        expect(
            client.getQueryData<RestaurantStatement>(statementQueryOptions(registration).queryKey)
        ).toEqual(fresh);
        expect(requests[0].headers.get('cache-control')).toBe('no-cache');
    });

    test('uma falha na atualização mantém os dados salvos e expõe o erro', async () => {
        client.setQueryData(statementQueryOptions(registration).queryKey, statement);
        response = () => {
            throw new ApiError(503, 'SIGAA indisponível');
        };
        const failure = await refreshQuery(client, statementQueryOptions(registration)).catch(
            (error: unknown) => error
        );
        expect(failure).toBeInstanceOf(ApiError);
        expect(
            client.getQueryData<RestaurantStatement>(statementQueryOptions(registration).queryKey)
        ).toEqual(statement);
        expect(client.getQueryState(statementQueryOptions(registration).queryKey)?.status).toBe(
            'error'
        );
    });

    test('o logout apaga as queries do RU', async () => {
        client.setQueryData(statementQueryOptions(registration).queryKey, statement);
        client.setQueryData(credentialsQueryOptions(registration).queryKey, credentials);
        await clearSession(client);
        expect(client.getQueryState(statementQueryOptions(registration).queryKey)).toBeUndefined();
        expect(
            client.getQueryState(credentialsQueryOptions(registration).queryKey)
        ).toBeUndefined();
    });

    test('uma resposta após o logout não recria os dados removidos', async () => {
        let complete: (value: Response) => void = noop;
        response = () =>
            new Promise<Response>((resolve) => {
                complete = resolve;
            });
        const pending = client.query(statementQueryOptions(registration)).catch(() => null);
        await Promise.resolve();
        await clearSession(client);
        complete(Response.json(statement));
        await pending;
        expect(client.getQueryState(statementQueryOptions(registration).queryKey)).toBeUndefined();
    });
});
