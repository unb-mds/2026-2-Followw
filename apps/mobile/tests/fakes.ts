import type { Middleware } from 'openapi-fetch';

import { apiClient, setApiOrigin } from '@followw/core/queries/client.ts';
import { toApiError } from '@followw/core/queries/errors.ts';

/** API falsa; converte o erro aqui porque a resposta do onRequest pula o onResponse. */
export function fakeApi(respond: (request: Request) => Response) {
    const api = { requests: [] as Request[], respond };
    const middleware: Middleware = {
        onRequest: async ({ request }) => {
            api.requests.push(request);
            const response = api.respond(request);
            if (!response.ok) throw toApiError(response.status, await response.json());
            return response;
        }
    };
    setApiOrigin('http://localhost');
    apiClient.use(middleware);
    return { api, eject: () => apiClient.eject(middleware) };
}

export const materialFile = (name = 'Anotações.txt', body = 'arquivo') =>
    new Response(body, {
        headers: {
            'content-type': 'text/plain; charset=utf-8',
            'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`
        }
    });
