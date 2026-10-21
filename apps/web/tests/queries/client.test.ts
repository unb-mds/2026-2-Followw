import { afterEach, beforeAll, describe, expect, mock, test } from 'bun:test';

import { apiClient } from '#/queries/client';
import { ApiError, toApiError } from '#/queries/errors';

// Requisição recebida pelo SSR; `null` simula o código fora de uma requisição.
let ssr: { url: string; cookie?: string; setCookie?: string[] } | null = null;

function inRequest() {
    if (!ssr) throw new Error('fora de uma requisição');
    return ssr;
}

beforeAll(async () => {
    const real = await import('@tanstack/react-start/server');
    await mock.module('@tanstack/react-start/server', () => ({
        ...real,
        getRequestHeader: (name: string) => (name === 'cookie' ? inRequest().cookie : undefined),
        getRequestUrl: () => new URL(inRequest().url),
        setResponseHeader: (name: string, value: string[]) => {
            if (name === 'set-cookie') inRequest().setCookie = value;
        }
    }));
});

afterEach(() => {
    ssr = null;
});

async function getMe(response: () => Response = () => Response.json(null)) {
    const requests: Request[] = [];
    const fetch = async (request: Request) => {
        requests.push(request);
        return response();
    };
    await apiClient.GET('/me', { fetch });
    return requests[0];
}

describe('cliente da API', () => {
    test('fora do SSR mantém o caminho e não inventa cookie', async () => {
        const request = await getMe();

        expect(new URL(request.url).pathname).toBe('/api/me');
        expect(request.headers.get('cookie')).toBeNull();
    });

    test('no SSR usa a origem e o cookie da requisição recebida', async () => {
        ssr = { url: 'https://followw.app/turmas?semestre=2026.2', cookie: 'access=abc' };

        const request = await getMe();

        expect(request.url).toBe('https://followw.app/api/me');
        expect(request.headers.get('cookie')).toBe('access=abc');
    });

    test('cada requisição do SSR leva só o próprio cookie', async () => {
        ssr = { url: 'https://followw.app/', cookie: 'access=ana' };
        const ana = await getMe();
        ssr = { url: 'https://followw.app/', cookie: 'access=bia' };
        const bia = await getMe();
        ssr = { url: 'https://followw.app/' };
        const anonimo = await getMe();

        expect(ana.headers.get('cookie')).toBe('access=ana');
        expect(bia.headers.get('cookie')).toBe('access=bia');
        expect(anonimo.headers.get('cookie')).toBeNull();
    });

    test('Set-Cookie da API chega à resposta do SSR', async () => {
        ssr = { url: 'https://followw.app/' };
        const headers = new Headers();
        headers.append('set-cookie', 'access=novo; Path=/');
        headers.append('set-cookie', 'refresh=novo; Path=/');

        await getMe(() => Response.json(null, { headers }));

        expect(ssr.setCookie).toEqual(['access=novo; Path=/', 'refresh=novo; Path=/']);
    });

    test('erro com detail vira ApiError com status e mensagem da API', async () => {
        const error = await getMe(() =>
            Response.json({ detail: 'Invalid credentials' }, { status: 401 })
        ).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toMatchObject({ status: 401, message: 'Invalid credentials' });
        expect(error instanceof ApiError && error.isUnauthorized).toBe(true);
    });

    test('erro sem JSON vira ApiError genérico', async () => {
        const error = await getMe(
            () => new Response('<html>Bad Gateway</html>', { status: 502 })
        ).catch((e: unknown) => e);

        expect(error).toMatchObject({ status: 502, detail: null, message: 'API error 502' });
        expect(error instanceof ApiError && error.isServerError).toBe(true);
    });

    test('resposta vazia de sucesso não é erro', async () => {
        const request = await getMe(() => new Response(null, { status: 204 }));

        expect(new URL(request.url).pathname).toBe('/api/me');
    });

    test('detail de validação preserva a estrutura da API', () => {
        const detail = [{ loc: ['body', 'registration'], msg: 'Field required' }];

        expect(toApiError(422, { detail }).detail).toEqual(detail);
        expect(toApiError(500, ['sem detail']).detail).toEqual(['sem detail']);
    });
});
