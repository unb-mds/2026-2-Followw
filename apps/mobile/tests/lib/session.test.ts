import type { MiddlewareCallbackParams } from 'openapi-fetch';

import * as SecureStore from 'expo-secure-store';

import { clearTokens, nativeAuthMiddleware } from '@/lib/session';

const params = (request: Request) =>
    ({
        request,
        schemaPath: '/me',
        params: {},
        id: '1',
        options: {}
    }) as unknown as MiddlewareCallbackParams;

async function send() {
    const request = new Request('https://followw.app/api/me');
    return (await nativeAuthMiddleware.onRequest?.(params(request))) as Request;
}

function respond(status: number, headers: Record<string, string> = {}) {
    const response = new Response(null, { status, headers });
    return nativeAuthMiddleware.onResponse?.({ ...params(new Request('https://x')), response });
}

beforeEach(() => clearTokens());

test('envia o header de modo nativo mesmo sem tokens', async () => {
    const request = await send();
    expect(request.headers.get('X-Followw-Auth')).toBe('header');
    expect(request.headers.has('X-Followw-Access')).toBe(false);
});

test('guarda os tokens devolvidos e os envia nas próximas requisições', async () => {
    await respond(200, { 'X-Followw-Access': 'a1', 'X-Followw-Refresh': 'r1' });
    const request = await send();
    expect(request.headers.get('X-Followw-Access')).toBe('a1');
    expect(request.headers.get('X-Followw-Refresh')).toBe('r1');
    expect(SecureStore.getItem('followw.refresh')).toBe('r1');
});

test('resposta 401 descarta os tokens salvos', async () => {
    await respond(200, { 'X-Followw-Access': 'a1', 'X-Followw-Refresh': 'r1' });
    await respond(401);
    const request = await send();
    expect(request.headers.has('X-Followw-Refresh')).toBe(false);
    expect(SecureStore.getItem('followw.access')).toBeNull();
});
