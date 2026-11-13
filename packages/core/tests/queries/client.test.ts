import { afterEach, expect, test } from 'bun:test';

import { apiClient, setApiOrigin } from '../../src/queries/client.ts';
import { ApiError } from '../../src/queries/errors.ts';

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
