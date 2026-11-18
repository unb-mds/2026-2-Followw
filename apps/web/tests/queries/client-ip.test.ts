import { afterEach, expect, test } from 'bun:test';

import { clientIpHeaders } from '#/queries/client-ip.server';

const originalSecret = process.env.RATE_LIMIT_SECRET_KEY;
const originalVercel = process.env.VERCEL;
const originalTrustedProxy = process.env.FOLLOWW_TRUST_PROXY;

afterEach(() => {
    if (originalSecret === undefined) delete process.env.RATE_LIMIT_SECRET_KEY;
    else process.env.RATE_LIMIT_SECRET_KEY = originalSecret;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalTrustedProxy === undefined) delete process.env.FOLLOWW_TRUST_PROXY;
    else process.env.FOLLOWW_TRUST_PROXY = originalTrustedProxy;
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

test('assina o IP encaminhado pelo proxy quando ele é confiável', () => {
    process.env.RATE_LIMIT_SECRET_KEY = 'chave-de-teste-nao-usar-em-producao';
    process.env.FOLLOWW_TRUST_PROXY = '1';
    delete process.env.VERCEL;
    const request = new Request('https://followw.app', {
        headers: { 'x-forwarded-for': '203.0.113.1' }
    });

    expect(clientIpHeaders(request).get('x-followw-client')).toMatch(/^\d+:203\.0\.113\.1$/);
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
