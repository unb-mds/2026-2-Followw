import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';

import { ErrorPage } from '#/components/ErrorPage';
import { PendingPage } from '#/components/PendingPage';
import { getContext } from '#/integrations/tanstack-query/root-provider';
import { routeTree } from '#/routeTree.gen';

export function getRouter() {
    const context = getContext();

    const router = createTanStackRouter({
        routeTree,
        context,
        defaultErrorComponent: ErrorPage,
        defaultPendingComponent: PendingPage,
        defaultPendingMs: 200,
        scrollRestoration: true,
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0
    });

    setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

    return router;
}

declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof getRouter>;
    }
}
