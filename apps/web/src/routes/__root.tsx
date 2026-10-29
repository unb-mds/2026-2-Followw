import type { QueryClient } from '@tanstack/react-query';

import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    isNotFound
} from '@tanstack/react-router';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { useEffect } from 'react';

import { ErrorPage } from '#/components/ErrorPage';
import { NotFoundPage } from '#/components/NotFoundPage';
import { initializeInstallSupport } from '#/integrations/offline/install';
import { useOfflineSupport } from '#/integrations/offline/use-offline-support';
import PostHogProvider from '#/integrations/posthog/provider';
import { reloadOnPreloadError } from '#/lib/chunk-reload';
import { themeScript } from '#/lib/theme';
import { useSessionRefresh } from '#/queries/auth';
import appCss from '#/styles.css?url';

interface MyRouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    head: ({ match }) => ({
        meta: [
            { charSet: 'utf-8' },
            {
                name: 'viewport',
                content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
            },
            { name: 'theme-color', content: '#007c5d' },
            { name: 'apple-mobile-web-app-capable', content: 'yes' },
            { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
            { name: 'apple-mobile-web-app-title', content: 'Followw' },
            { name: 'description', content: 'O Followw é sua nova forma de usar o SIGAA UnB.' },
            // Apenas as páginas públicas sobrescrevem esta regra para permitir indexação.
            { name: 'robots', content: 'noindex, follow' },
            { title: isNotFound(match?.error) ? 'Página não encontrada | Followw' : 'Followw' }
        ],
        links: [
            { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
            { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
            { rel: 'apple-touch-icon', href: '/apple-touch-icon.png?v=2' },
            { rel: 'manifest', href: '/manifest.json' },
            { rel: 'stylesheet', href: appCss }
        ]
    }),
    shellComponent: RootDocument,
    errorComponent: ErrorPage,
    notFoundComponent: NotFoundPage,
    component: RootComponent
});

function RootComponent() {
    useSessionRefresh();
    useEffect(() => reloadOnPreloadError(), []);
    useEffect(() => initializeInstallSupport(), []);
    useOfflineSupport();

    return (
        <NuqsAdapter>
            <Outlet />
        </NuqsAdapter>
    );
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                <HeadContent />
            </head>
            <body>
                <PostHogProvider>{children}</PostHogProvider>
                <Scripts />
            </body>
        </html>
    );
}
