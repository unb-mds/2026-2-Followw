import type { Middleware } from 'openapi-fetch';

import { noop, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { RestaurantStatement, RestaurantCredentials } from '#/queries/restaurant-account';

import { STORAGE_KEYS, localStorageRepository } from '#/lib/local-storage';
import { clearSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { refreshQuery } from '#/queries/refresh';
import {
    credentialsQueryOptions,
    restoreRestaurantAccount,
    statementQueryOptions
} from '#/queries/restaurant-account';

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

function seed(data: unknown = statement, owner = registration) {
    localStorageRepository.set(STORAGE_KEYS.RU_BALANCE, {
        registration: owner,
        data,
        updatedAt: 1
    });
    localStorageRepository.set(STORAGE_KEYS.RU_TOKEN, {
        registration: owner,
        data: credentials,
        updatedAt: 1
    });
}

describe('cache da conta do RU', () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let middleware: Middleware;
    let requests: Request[];
    let response: (request: Request) => Response | Promise<Response>;
    let client: QueryClient;

    beforeEach(() => {
        const values = new Map<string, string>();
        const storage: Storage = {
            get length() {
                return values.size;
            },
            key: (index) => [...values.keys()][index] ?? null,
            getItem: (key) => values.get(key) ?? null,
            setItem: (key, value) => {
                values.set(key, value);
            },
            removeItem: (key) => {
                values.delete(key);
            },
            clear: () => values.clear()
        };
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { localStorage: storage }
        });
        requests = [];
        response = (request) =>
            Response.json(
                new URL(request.url).pathname === '/me/ru-token' ? credentials : statement
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
        if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
        else Reflect.deleteProperty(globalThis, 'window');
    });

    test('salva o saldo, grupo, extrato, token e validade com escopo da matrícula', async () => {
        await client.query(statementQueryOptions(registration));
        await client.query(credentialsQueryOptions(registration));
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toMatchObject({
            registration,
            data: statement
        });
        expect(localStorageRepository.get(STORAGE_KEYS.RU_TOKEN)).toMatchObject({
            registration,
            data: credentials
        });
        expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
            '/me/ru-statement',
            '/me/ru-token'
        ]);
        expect(requests.every((request) => new URL(request.url).search === '')).toBe(true);
    });

    test('restaura os dados salvos e sua data ao reabrir a página', () => {
        seed();
        restoreRestaurantAccount(client, registration);
        expect(
            client.getQueryData<RestaurantStatement>(statementQueryOptions(registration).queryKey)
        ).toEqual(statement);
        expect(
            client.getQueryData<RestaurantCredentials>(
                credentialsQueryOptions(registration).queryKey
            )
        ).toEqual(credentials);
        expect(
            client.getQueryState(statementQueryOptions(registration).queryKey)?.dataUpdatedAt
        ).toBe(1);
    });

    test('não restaura dados de outra matrícula e isola o cache de queries por conta', () => {
        seed();
        restoreRestaurantAccount(client, 'outra-matricula');
        expect(
            client.getQueryData<RestaurantStatement>(
                statementQueryOptions('outra-matricula').queryKey
            )
        ).toBeUndefined();
        expect(
            client.getQueryData<RestaurantCredentials>(
                credentialsQueryOptions('outra-matricula').queryKey
            )
        ).toBeUndefined();
        expect(statementQueryOptions(registration).queryKey).not.toEqual(
            statementQueryOptions('outra-matricula').queryKey
        );
    });

    test('ignora cache legado ou dados malformados', () => {
        localStorageRepository.set(STORAGE_KEYS.RU_BALANCE, 42.5);
        localStorageRepository.set(STORAGE_KEYS.RU_TOKEN, 'token-legado');
        restoreRestaurantAccount(client, registration);
        expect(
            client.getQueryData<RestaurantStatement>(statementQueryOptions(registration).queryKey)
        ).toBeUndefined();
        expect(
            client.getQueryData<RestaurantCredentials>(
                credentialsQueryOptions(registration).queryKey
            )
        ).toBeUndefined();

        seed({ balance: 'NaN', group: 2, entries: [] });
        localStorageRepository.set(STORAGE_KEYS.RU_TOKEN, {
            registration,
            data: { token: 'token', valid_until: '2026-99-99' },
            updatedAt: 1
        });
        restoreRestaurantAccount(client, registration);
        expect(
            client.getQueryData<RestaurantStatement>(statementQueryOptions(registration).queryKey)
        ).toBeUndefined();
        expect(
            client.getQueryData<RestaurantCredentials>(
                credentialsQueryOptions(registration).queryKey
            )
        ).toBeUndefined();
    });

    test('persiste dados carregados no SSR sem sobrescrevê-los com o cache antigo', () => {
        seed();
        const fresh = { ...statement, balance: '20.00' };
        client.setQueryData(statementQueryOptions(registration).queryKey, fresh);
        client.setQueryData(credentialsQueryOptions(registration).queryKey, credentials);
        restoreRestaurantAccount(client, registration);
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toMatchObject({ data: fresh });
    });

    test('atualiza pela API preservando a matrícula e substitui o cache local', async () => {
        seed();
        restoreRestaurantAccount(client, registration);
        const fresh = { ...statement, balance: '30.00' };
        response = () => Response.json(fresh);
        await refreshQuery(client, statementQueryOptions(registration));
        expect(
            client.getQueryData<RestaurantStatement>(statementQueryOptions(registration).queryKey)
        ).toEqual(fresh);
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toMatchObject({
            registration,
            data: fresh
        });
        expect(requests[0].headers.get('cache-control')).toBe('no-cache');
    });

    test('uma falha na atualização mantém os dados salvos e expõe o erro', async () => {
        seed();
        restoreRestaurantAccount(client, registration);
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
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toMatchObject({
            data: statement
        });
    });

    test('o logout apaga as queries e os dados pessoais do RU', () => {
        seed();
        localStorageRepository.set('preferencia', 'manter');
        restoreRestaurantAccount(client, registration);
        clearSession(client);
        expect(client.getQueryState(statementQueryOptions(registration).queryKey)).toBeUndefined();
        expect(
            client.getQueryState(credentialsQueryOptions(registration).queryKey)
        ).toBeUndefined();
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toBeNull();
        expect(localStorageRepository.get(STORAGE_KEYS.RU_TOKEN)).toBeNull();
        expect(localStorageRepository.get<string>('preferencia')).toBe('manter');
    });

    test('uma resposta após o logout não recria os dados removidos', async () => {
        let complete: (value: Response) => void = noop;
        response = () =>
            new Promise<Response>((resolve) => {
                complete = resolve;
            });
        const pending = client.query(statementQueryOptions(registration)).catch(() => null);
        await Promise.resolve();
        clearSession(client);
        complete(Response.json(statement));
        await pending;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toBeNull();
        expect(client.getQueryState(statementQueryOptions(registration).queryKey)).toBeUndefined();
    });

    test('a consulta no servidor funciona sem local storage', async () => {
        Reflect.deleteProperty(globalThis, 'window');
        expect(await client.query(statementQueryOptions(registration))).toEqual(statement);
        expect(localStorageRepository.get(STORAGE_KEYS.RU_BALANCE)).toBeNull();
    });
});
