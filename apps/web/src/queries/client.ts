import type { Middleware } from 'openapi-fetch';

import { apiClient, setApiOrigin } from '@followw/core/queries/client.ts';
import { createIsomorphicFn } from '@tanstack/react-start';

import { ssrApiTarget, ssrRequest } from '#/queries/ssr.ts';

// a API fica em /api da mesma origem; no SSR o fetch exige URL absoluta, e a origem provisória é
// trocada pela da requisição recebida (veja `ssrMiddleware`)
createIsomorphicFn()
    .client(() => {})
    .server(() => setApiOrigin('http://localhost'))();

// a assinatura do IP é opcional: falhar aqui não pode derrubar a sessão
const clientIpHeaders = createIsomorphicFn()
    .client(async (_request: Request) => new Headers())
    .server(async (request: Request) =>
        import('#/queries/client-ip.server').then((module) => module.clientIpHeaders(request))
    );

const ssrMiddleware: Middleware = {
    async onRequest({ request: original }) {
        const server = await ssrRequest();
        if (!server) return original;
        const { pathname, search } = new URL(original.url);
        const incoming = server.getRequest();
        const { url, protocol } = ssrApiTarget(
            pathname + search,
            incoming,
            server.getRequestUrl().href
        );
        const request = new Request(url, original);
        if (protocol) request.headers.set('x-forwarded-proto', protocol);
        const cookie = incoming.headers.get('cookie');
        if (cookie) request.headers.set('cookie', cookie);
        const ipHeaders = await clientIpHeaders(incoming).catch(() => new Headers());
        ipHeaders.forEach((value, name) => request.headers.set(name, value));
        return request;
    },
    async onResponse({ response }) {
        const cookies = response.headers.getSetCookie();
        if (cookies.length) (await ssrRequest())?.setResponseHeader('set-cookie', cookies);
    }
};

let installed = false;

export function installApiClient() {
    if (installed) return;
    installed = true;
    apiClient.use(ssrMiddleware);
}
