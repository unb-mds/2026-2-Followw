import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError, toApiError } from '@followw/core/queries/errors.ts';
import { afterAll, afterEach, beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';

// Requisição recebida pelo SSR; `null` simula o código fora de uma requisição.
let ssr: {
    url: string;
    cookie?: string;
    ip?: string;
    forwardedProto?: string;
    setCookie?: string[];
} | null = null;
const originalSecret = process.env.RATE_LIMIT_SECRET_KEY;
const originalVercel = process.env.VERCEL;
const originalApiOrigin = process.env.FOLLOWW_SSR_API_ORIGIN;
const originalTrustedProxy = process.env.FOLLOWW_TRUST_PROXY;
let originalServer: typeof import('@tanstack/react-start/server');

function inRequest() {
    if (!ssr) throw new Error('fora de uma requisição');
    return ssr;
}

beforeAll(async () => {
    originalServer = { ...(await import('@tanstack/react-start/server')) };
    await mock.module('@tanstack/react-start/server', () => ({
        ...originalServer,
        getRequestHeader: (name: string) => (name === 'cookie' ? inRequest().cookie : undefined),
        getRequest: () => {
            const incoming = inRequest();
            const headers = new Headers();
            if (incoming.cookie) headers.set('cookie', incoming.cookie);
            if (incoming.ip) headers.set('x-vercel-forwarded-for', incoming.ip);
            if (incoming.forwardedProto) headers.set('x-forwarded-proto', incoming.forwardedProto);
            return new Request(incoming.url, { headers });
        },
        getRequestUrl: (options?: { xForwardedProto?: boolean }) => {
            const { url, forwardedProto } = inRequest();
            const result = new URL(url);
            if (forwardedProto && options?.xForwardedProto !== false)
                result.protocol = forwardedProto;
            return result;
        },
        setResponseHeader: (name: string, value: string[]) => {
            if (name === 'set-cookie') inRequest().setCookie = value;
        }
    }));
});

afterAll(async () => {
    await mock.module('@tanstack/react-start/server', () => originalServer);
});

afterEach(() => {
    ssr = null;
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET_KEY;
    else process.env.RATE_LIMIT_SECRET_KEY = originalSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalApiOrigin === undefined) delete process.env.FOLLOWW_SSR_API_ORIGIN;
    else process.env.FOLLOWW_SSR_API_ORIGIN = originalApiOrigin;
    if (originalTrustedProxy === undefined) delete process.env.FOLLOWW_TRUST_PROXY;
    else process.env.FOLLOWW_TRUST_PROXY = originalTrustedProxy;
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
        delete process.env.FOLLOWW_SSR_API_ORIGIN;
        delete process.env.FOLLOWW_TRUST_PROXY;
        ssr = {
            url: 'http://followw.app/turmas?semestre=2026.2',
            forwardedProto: 'https',
            cookie: 'access=abc'
        };

        const request = await getMe();

        expect(request.url).toBe('https://followw.app/api/me');
        expect(request.headers.get('cookie')).toBe('access=abc');
    });

    test('no SSR usa a API interna sem o prefixo do proxy e preserva o cookie', async () => {
        process.env.FOLLOWW_SSR_API_ORIGIN = 'http://api:8000';
        process.env.FOLLOWW_TRUST_PROXY = '1';
        ssr = {
            url: 'http://followw.app/turmas',
            forwardedProto: 'http, HTTPS',
            cookie: 'access=abc'
        };

        const request = await getMe();

        expect(request.url).toBe('http://api:8000/me');
        expect(request.headers.get('cookie')).toBe('access=abc');
        expect(request.headers.get('x-forwarded-proto')).toBe('https');
    });

    test('falha ao assinar o IP não descarta o cookie do SSR', async () => {
        const signer = await import('#/queries/client-ip.server');
        const sign = spyOn(signer, 'clientIpHeaders').mockImplementation(() => {
            throw new Error('sem crypto');
        });
        try {
            ssr = { url: 'https://followw.app/', cookie: 'access=abc' };
            const request = await getMe();

            expect(sign).toHaveBeenCalled();
            expect(request.headers.get('cookie')).toBe('access=abc');
        } finally {
            sign.mockRestore();
        }
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

    test('SSR assina o IP original sem misturar usuários', async () => {
        process.env.RATE_LIMIT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
        process.env.VERCEL = '1';
        const clock = spyOn(Date, 'now').mockReturnValue(120_000);
        try {
            ssr = { url: 'https://followw.app/', ip: '203.0.113.1' };
            const alice = await getMe();
            ssr = { url: 'https://followw.app/', ip: '203.0.113.2' };
            const bob = await getMe();

            expect(alice.headers.get('x-followw-client')).toBe('120:203.0.113.1');
            expect(alice.headers.get('x-followw-client-signature')).toBe(
                'cf2d59c353d91bae0e0089de0020b361cc37be323297c61030ce640b9d60ec13'
            );
            expect(bob.headers.get('x-followw-client')).toBe('120:203.0.113.2');
            expect(bob.headers.get('x-followw-client-signature')).not.toBe(
                alice.headers.get('x-followw-client-signature')
            );
            expect([...alice.headers.values()].join(' ')).not.toContain(
                process.env.RATE_LIMIT_SECRET_KEY
            );
        } finally {
            clock.mockRestore();
        }
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
