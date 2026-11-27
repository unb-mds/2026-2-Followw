import type { AccountData } from '@followw/core/queries/account-data.ts';
import type { UserProfile } from '@followw/core/queries/me.ts';
import type { Middleware } from 'openapi-fetch';

import { accountDataQueryOptions } from '@followw/core/queries/account-data.ts';
import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import {
    createRootRoute,
    createRouter,
    createMemoryHistory,
    RouterProvider
} from '@tanstack/react-router';
import { afterAll, afterEach, beforeAll, beforeEach } from 'bun:test';

import { mockBrowserLayoutEffect } from '../../helpers/base-ui';
import { useDom } from '../../helpers/dom';

export const ACCOUNT: AccountData = {
    registration: '251000000',
    name: 'Estudante',
    applications: [],
    has_connected_applications: false
};

export const PROFILE: UserProfile = {
    name: 'Estudante',
    registration: '251000000',
    photo: null,
    email: null,
    bio: null,
    unit: null,
    course: null,
    entry_semester: null,
    integralization: 35,
    workload: null,
    ira: 4,
    mp: 4,
    period_max_workload: null,
    level: 'Graduação'
};

export function createDeletionFixture() {
    const dom = useDom();
    let Route: typeof import('#/routes/excluir-conta').Route;
    let restore: () => Promise<void>;
    let client: QueryClient;
    let middleware: Middleware;
    let requests: Request[];
    let account: AccountData | null;
    let sessionFailure: boolean;
    let response: () => Response | Promise<Response>;

    beforeAll(async () => {
        restore = await mockBrowserLayoutEffect();
        ({ Route } = await import('#/routes/excluir-conta'));
    });
    afterAll(async () => restore());
    beforeEach(() => {
        client = new QueryClient({
            defaultOptions: {
                queries: { retry: false, staleTime: Infinity },
                mutations: { networkMode: 'always' }
            }
        });
        requests = [];
        account = ACCOUNT;
        sessionFailure = false;
        response = () => new Response(null, { status: 204 });
        middleware = {
            onRequest: ({ request }) => {
                requests.push(request);
                if (request.method === 'DELETE') return response();
                if (sessionFailure)
                    return Response.json({ detail: 'Indisponível' }, { status: 500 });
                if (!account) throw new ApiError(401, 'Sem sessão');
                return Response.json(account);
            }
        };
        apiClient.use(middleware);
    });
    afterEach(() => {
        dom.testing.cleanup();
        client.clear();
        apiClient.eject(middleware);
        onlineManager.setOnline(true);
        localStorage.clear();
    });

    return {
        dom,
        get client() {
            return client;
        },
        get requests() {
            return requests;
        },
        get deletions() {
            return requests.filter((request) => request.method === 'DELETE');
        },
        set account(value: AccountData | null) {
            account = value;
        },
        set sessionFailure(value: boolean) {
            sessionFailure = value;
        },
        set response(value: () => Response | Promise<Response>) {
            response = value;
        },
        async render() {
            const router = createRouter({
                routeTree: createRootRoute({ component: Route.options.component }),
                history: createMemoryHistory({ initialEntries: ['/excluir-conta'] })
            });
            await router.load();
            return dom.testing.render(
                <QueryClientProvider client={client}>
                    <RouterProvider router={router} />
                </QueryClientProvider>
            );
        },
        seedAccount() {
            client.setQueryData(accountDataQueryOptions.queryKey, account);
        }
    };
}
