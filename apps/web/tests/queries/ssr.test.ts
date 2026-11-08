import { apiClient } from '@followw/core/queries/client.ts';
import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from 'bun:test';

// Requisição recebida pelo SSR; `null` simula o código fora de uma requisição.
let ssr: { url: string; cookie?: string; ip?: string; setCookie?: string[] } | null = null;
const originalSecret = process.env.RATE_LIMIT_SECRET_KEY;
const originalVercel = process.env.VERCEL;

function inRequest() {
    if (!ssr) throw new Error('fora de uma requisição');
    return ssr;
}

beforeAll(async () => {
    const real = await import('@tanstack/react-start/server');
    await mock.module('@tanstack/react-start/server', () => ({
        ...real,
        getRequestHeader: (name: string) => (name === 'cookie' ? inRequest().cookie : undefined),
        getRequest: () => {
            const incoming = inRequest();
            const headers = new Headers();
            if (incoming.cookie) headers.set('cookie', incoming.cookie);
            if (incoming.ip) headers.set('x-vercel-forwarded-for', incoming.ip);
            return new Request(incoming.url, { headers });
        },
        getRequestUrl: () => new URL(inRequest().url),
        setResponseHeader: (name: string, value: string[]) => {
            if (name === 'set-cookie') inRequest().setCookie = value;
        }
    }));
});

afterEach(() => {
    ssr = null;
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET_KEY;
    else process.env.RATE_LIMIT_SECRET_KEY = originalSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
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

describe('middleware SSR do cliente da API', () => {
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
});
