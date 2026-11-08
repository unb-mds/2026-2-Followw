import { afterEach, expect, test } from 'bun:test';

import { apiClient, setApiOrigin } from '../../src/queries/client.ts';
import { ApiError, parseRetryAfter } from '../../src/queries/errors.ts';

afterEach(() => setApiOrigin('http://localhost'));

test('cliente compartilhado usa a origem informada pela plataforma', async () => {
    setApiOrigin('https://api.followw.test///');
    let url = '';
    await apiClient.GET('/public/subjects', {
        params: { query: { q: 'cálculo' } },
        fetch: async (request) => {
            url = request.url;
            return Response.json({ items: [] });
        }
    });
    expect(new URL(url).origin).toBe('https://api.followw.test');
    expect(new URL(url).pathname).toBe('/api/public/subjects');
    expect(new URL(url).searchParams.get('q')).toBe('cálculo');
});

test('middleware da plataforma pode substituir a requisição por uma Request nativa', async () => {
    const middleware = {
        onRequest: ({ request }: { request: Request }) =>
            new Request('https://followw.test/api/me', request)
    };
    apiClient.use(middleware);
    try {
        let url = '';
        await apiClient.GET('/me', {
            fetch: async (request) => {
                url = request.url;
                return Response.json(null);
            }
        });
        expect(url).toBe('https://followw.test/api/me');
    } finally {
        apiClient.eject(middleware);
    }
});

test('cliente compartilhado traduz erros HTTP sem depender do web', async () => {
    const error = await apiClient
        .GET('/me', {
            fetch: async () => Response.json({ detail: 'Sessão expirada' }, { status: 401 })
        })
        .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'Sessão expirada' });
});

test('erro 429 carrega o tempo de espera do Retry-After em segundos', async () => {
    const error = await apiClient
        .GET('/me', {
            fetch: async () =>
                new Response(null, { status: 429, headers: { 'Retry-After': '120' } })
        })
        .catch((reason: unknown) => reason);
    expect(error).toMatchObject({ status: 429, retryAfter: 120 });
});

test.each([
    [null, undefined],
    ['abc', undefined],
    ['30', 30],
    ['-5', 0],
    ['Thu, 01 Jan 2026 00:01:00 GMT', 60]
])('interpreta o Retry-After %p como %p', (header, expected) => {
    expect(parseRetryAfter(header, Date.parse('2026-01-01T00:00:00Z'))).toBe(expected);
});
