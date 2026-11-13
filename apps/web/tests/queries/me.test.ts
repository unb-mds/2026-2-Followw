import type { Middleware } from 'openapi-fetch';

import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { QueryClient } from '@tanstack/react-query';
import { createServerEntry } from '@tanstack/react-start/server';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { meQueryOptions } from '#/queries/me';

describe('perfil no SSR', () => {
    let middleware: Middleware | undefined;
    afterEach(() => {
        if (middleware) apiClient.eject(middleware);
    });

    const entry = createServerEntry({
        async fetch() {
            const client = new QueryClient();
            return Response.json(await client.query({ ...meQueryOptions, retry: false }));
        }
    });

    test.each([undefined, 'outro=valor', 'refresh_token='])(
        'SSR sem refresh_token não consulta a API: %s',
        async (cookie) => {
            let requests = 0;
            middleware = {
                onRequest() {
                    requests++;
                    return Response.json({}, { status: 401 });
                }
            };
            apiClient.use(middleware);
            const response = await entry.fetch(
                new Request('https://followw.app/', { headers: cookie ? { cookie } : {} })
            );
            expect(await response.json()).toBeNull();
            expect(requests).toBe(0);
        }
    );

    test('SSR consulta a API quando há sessão e mantém o 401 como visitante', async () => {
        let requests = 0;
        middleware = {
            onRequest() {
                requests++;
                throw new ApiError(401, 'Sessão expirada');
            }
        };
        apiClient.use(middleware);
        const response = await entry.fetch(
            new Request('https://followw.app/', { headers: { cookie: 'refresh_token=expirado' } })
        );
        expect(await response.json()).toBeNull();
        expect(requests).toBe(1);
    });

    test('requisições SSR concorrentes isolam a sessão de cada visitante', async () => {
        let requests = 0;
        const user = { registration: '251000000' };
        middleware = {
            async onRequest() {
                requests++;
                await new Promise((resolve) => setTimeout(resolve, 5));
                return Response.json(user);
            }
        };
        apiClient.use(middleware);
        const [authenticated, anonymous] = await Promise.all([
            entry.fetch(
                new Request('https://followw.app/', { headers: { cookie: 'refresh_token=valido' } })
            ),
            entry.fetch(new Request('https://followw.app/'))
        ]);
        expect(await authenticated.json()).toEqual(user);
        expect(await anonymous.json()).toBeNull();
        expect(requests).toBe(1);
    });
});

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
