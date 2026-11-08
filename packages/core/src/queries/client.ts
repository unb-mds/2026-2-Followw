import createClient, { type Middleware } from 'openapi-fetch';

import type { paths } from './schema.gen.ts';

import { parseRetryAfter, toApiError } from './errors.ts';

// fora do navegador `/api` não é uma URL válida: a plataforma informa a origem (ou o servidor, no SSR)
let origin = '';

export function setApiOrigin(value: string) {
    origin = value.replace(/\/+$/, '');
}

class ApiRequest extends Request {
    // o openapi-fetch exige `instanceof` do middleware; qualquer Request serve
    static [Symbol.hasInstance](value: unknown) {
        return value instanceof Request;
    }

    constructor(input: string | Request, init?: RequestInit) {
        if (typeof input === 'string') super(input.startsWith('/') ? origin + input : input, init);
        else super(input, init);
    }
}

const errorHandlingMiddleware: Middleware = {
    async onResponse({ response }) {
        if (!response.ok) {
            const body = await response
                .clone()
                .json()
                .catch(() => null);
            throw toApiError(
                response.status,
                body,
                parseRetryAfter(response.headers.get('Retry-After'))
            );
        }
    }
};

// cada plataforma registra os próprios middlewares com `apiClient.use` (depois do de erro)
export const apiClient = createClient<paths>({
    baseUrl: '/api',
    credentials: 'include',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- só amplia o construtor para a assinatura sobrecarregada
    Request: ApiRequest as unknown as typeof Request
});

apiClient.use(errorHandlingMiddleware);
