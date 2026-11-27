import { afterEach, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { clientIpHeaders } from '#/queries/client-ip.server';

const originalSecret = process.env.RATE_LIMIT_SECRET_KEY;
const originalVercel = process.env.VERCEL;
const originalTrustedProxy = process.env.FOLLOWW_TRUST_PROXY;
const originalCloudflareCidrs = process.env.FOLLOWW_CLOUDFLARE_CIDRS;

afterEach(() => {
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET_KEY;
    else process.env.RATE_LIMIT_SECRET_KEY = originalSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalTrustedProxy === undefined) delete process.env.FOLLOWW_TRUST_PROXY;
    else process.env.FOLLOWW_TRUST_PROXY = originalTrustedProxy;
    if (originalCloudflareCidrs === undefined) delete process.env.FOLLOWW_CLOUDFLARE_CIDRS;
    else process.env.FOLLOWW_CLOUDFLARE_CIDRS = originalCloudflareCidrs;
});

test('fora da Vercel não assina cabeçalhos de IP enviados pelo usuário', () => {
    process.env.RATE_LIMIT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
    delete process.env.VERCEL;
    delete process.env.FOLLOWW_TRUST_PROXY;
    const request = new Request('https://followw.app', {
        headers: { 'x-forwarded-for': '203.0.113.1', 'x-vercel-forwarded-for': '203.0.113.1' }
    });
    expect([...clientIpHeaders(request)]).toEqual([]);
});

test('assina o último IP encaminhado pelo proxy confiável e ignora IPs forjados antes dele', () => {
    process.env.RATE_LIMIT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
    process.env.FOLLOWW_TRUST_PROXY = '1';
    delete process.env.VERCEL;
    const request = new Request('https://followw.app', {
        headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.1' }
    });

    expect(clientIpHeaders(request).get('x-followw-client')).toMatch(/^\d+:203\.0\.113\.1$/);
});

test.each([
    ['104.21.58.165', '203.0.113.1', '203.0.113.1'],
    ['2606:4700:3030::1', '2001:db8::1', '2001:db8::1'],
    ['198.51.100.9', '203.0.113.1', '198.51.100.9'],
    ['104.21.58.165', 'inválido', '104.21.58.165']
])('resolve o visitante com origem %s e cabeçalho %s', (peer, visitor, ip) => {
    process.env.RATE_LIMIT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
    process.env.FOLLOWW_TRUST_PROXY = '1';
    process.env.FOLLOWW_CLOUDFLARE_CIDRS = fileURLToPath(
        new URL('../../../../deploy/oci/cloudflare-cidrs.txt', import.meta.url)
    );
    delete process.env.VERCEL;
    const request = new Request('https://oracle.followw.app', {
        headers: {
            'x-forwarded-for': `192.0.2.1, ${peer}`,
            'cf-connecting-ip': visitor
        }
    });
    expect(clientIpHeaders(request).get('x-followw-client')?.split(':').slice(1).join(':')).toBe(
        ip
    );
});

test.each(['', 'ip-invalido'])('não assina IP inválido: %s', (ip) => {
    process.env.RATE_LIMIT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
    process.env.VERCEL = '1';
    const request = new Request('https://followw.app', {
        headers: { 'x-vercel-forwarded-for': ip }
    });
    expect([...clientIpHeaders(request)]).toEqual([]);
});

test('sem segredo não emite encaminhamento sem autenticação', () => {
    delete process.env.RATE_LIMIT_SECRET_KEY;
    process.env.VERCEL = '1';
    const request = new Request('https://followw.app', {
        headers: { 'x-vercel-forwarded-for': '203.0.113.1' }
    });
    expect([...clientIpHeaders(request)]).toEqual([]);
});
