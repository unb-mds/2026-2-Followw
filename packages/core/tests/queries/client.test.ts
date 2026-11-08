import { describe, expect, test } from 'bun:test';

import { apiClient, setApiOrigin } from '../../src/queries/client.ts';
import { ApiError, parseRetryAfter, toApiError } from '../../src/queries/errors.ts';

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
    test('prefixa a origem da plataforma nos caminhos relativos', async () => {
        setApiOrigin('https://followw.app/');
        try {
            expect((await getMe()).url).toBe('https://followw.app/api/me');
        } finally {
            setApiOrigin('http://localhost');
        }
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

describe('Retry-After', () => {
    test('erro 429 carrega o tempo de espera em segundos', async () => {
        const error = await getMe(
            () => new Response(null, { status: 429, headers: { 'Retry-After': '120' } })
        ).catch((e: unknown) => e);

        expect(error).toMatchObject({ status: 429, retryAfter: 120 });
    });

    test.each([
        [null, undefined],
        ['abc', undefined],
        ['30', 30],
        ['-5', 0],
        ['Thu, 01 Jan 2026 00:01:00 GMT', 60]
    ])('interpreta o header %p como %p', (header, expected) => {
        expect(parseRetryAfter(header, Date.parse('2026-01-01T00:00:00Z'))).toBe(expected);
    });
});
