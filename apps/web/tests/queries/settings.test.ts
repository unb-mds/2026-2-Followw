import type { Middleware } from 'openapi-fetch';

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { UserSettings } from '#/queries/settings';

import { clearSession } from '#/queries/auth';
import { apiClient } from '#/queries/client';
import { ApiError } from '#/queries/errors';
import { settingsQueryOptions } from '#/queries/settings';

const registration = '251000000';
const settings: UserSettings = { displayName: 'Ana', defaultRuCampus: 'Gama' };

describe('configurações do usuário', () => {
    let middleware: Middleware;
    let requests: Request[];
    let response: () => Response;
    let client: QueryClient;

    beforeEach(() => {
        requests = [];
        response = () => Response.json(settings);
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                return response();
            }
        };
        apiClient.use(middleware);
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    });

    afterEach(() => {
        client.clear();
        apiClient.eject(middleware);
    });

    test('busca na API com escopo da matrícula', async () => {
        expect(await client.query(settingsQueryOptions(registration))).toEqual(settings);
        expect(settingsQueryOptions(registration).queryKey).not.toEqual(
            settingsQueryOptions('outra-matricula').queryKey
        );
        expect(requests.map((request) => new URL(request.url).pathname)).toEqual(['/me/settings']);
    });

    test('sem login resolve vazio sem ir à API', async () => {
        expect(await client.query(settingsQueryOptions(null))).toEqual({});
        expect(requests).toHaveLength(0);
    });

    test('sessão expirada resolve vazio', async () => {
        response = () => {
            throw new ApiError(401, 'expirada');
        };

        expect(await client.query(settingsQueryOptions(registration))).toEqual({});
    });

    test('logout apaga as configurações do cache', async () => {
        await client.query(settingsQueryOptions(registration));

        await clearSession(client);

        expect(client.getQueryData(settingsQueryOptions(registration).queryKey)).toBeUndefined();
    });
});
