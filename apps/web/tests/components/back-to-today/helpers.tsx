import type { AnyRoute } from '@tanstack/react-router';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
    Outlet,
    RouterProvider
} from '@tanstack/react-router';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import { DesktopContext } from '#/components/DesktopContext';
import { PageStateProvider } from '#/components/PageState';
import { parseRouterSearch, stringifyRouterSearch } from '#/lib/search-params';
import { meQueryOptions } from '#/queries/me';

// monta a página real dentro de `_app`, com o header e o dado do loader já resolvido
export function appPage({
    route,
    path,
    url,
    loaderData,
    desktop = false
}: {
    route: AnyRoute;
    path: string;
    url: string;
    loaderData: unknown;
    desktop?: boolean;
}) {
    const client = new QueryClient({
        defaultOptions: { queries: { staleTime: Infinity, retry: false, enabled: false } }
    });
    client.setQueryData(meQueryOptions.queryKey, null);
    const Header = route.options.staticData?.header ?? (() => null);
    const root = createRootRoute();
    const app = createRoute({
        getParentRoute: () => root,
        id: '_app',
        component: () => (
            <NuqsAdapter>
                <DesktopContext value={desktop}>
                    <PageStateProvider page={path}>
                        <Header />
                        <Outlet />
                    </PageStateProvider>
                </DesktopContext>
            </NuqsAdapter>
        )
    });
    const page = createRoute({
        getParentRoute: () => app,
        path,
        component: route.options.component,
        validateSearch: route.options.validateSearch,
        loader: () => loaderData
    });
    const router = createRouter({
        routeTree: root.addChildren([app.addChildren([page])]),
        history: createMemoryHistory({ initialEntries: [url] }),
        parseSearch: parseRouterSearch,
        stringifySearch: stringifyRouterSearch
    });
    return {
        router,
        element: (
            <QueryClientProvider client={client}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        )
    };
}
