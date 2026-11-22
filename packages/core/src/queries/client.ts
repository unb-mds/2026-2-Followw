import createClient, { type Middleware } from 'openapi-fetch';

import type { components, paths } from './schema.gen.ts';

import { toApiError } from './errors.ts';

let origin = '';

/** Origem fixa da plataforma; no SSR, o middleware resolve a origem de cada requisição. */
export function setApiOrigin(value: string) {
    origin = value.replace(/\/+$/, '');
}

class ApiRequest extends Request {
    // Os middlewares das plataformas também podem devolver uma Request nativa.
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
            throw toApiError(response.status, body);
        }
    }
};

// Este cliente usa os cookies do Followw e recebe a variante completa em cada rota.
type CookieResponse<Body> = { responses: { 200: { content: { 'application/json': Body } } } };
type Schema = components['schemas'];
type CookiePaths = paths & {
    '/me': { get: CookieResponse<Schema['UserProfile']> };
    '/me/profile': { patch: CookieResponse<Schema['UserProfile']> };
    '/classrooms': { get: CookieResponse<Schema['ParticipantClassroom'][]> };
    '/classrooms/frequency': { get: CookieResponse<Schema['ClassroomFrequencyResult'][]> };
    '/lessons': { get: CookieResponse<Schema['LessonDay'][]> };
    '/posts/news': { get: CookieResponse<Schema['LatestNewsFeed']> };
};

export const apiClient = createClient<CookiePaths>({
    baseUrl: '/api',
    credentials: 'include',
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- amplia a assinatura do construtor
    Request: ApiRequest as unknown as typeof Request
});

apiClient.use(errorHandlingMiddleware);
