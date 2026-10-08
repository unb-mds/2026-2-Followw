import type { QueryClient } from '@tanstack/react-query';

import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { useEffect } from 'react';

import { ErrorPage } from '#/components/ErrorPage';
import { useOfflineSupport } from '#/integrations/offline/use-offline-support';
import PostHogProvider from '#/integrations/posthog/provider';
import TanStackQueryDevtools from '#/integrations/tanstack-query/devtools';
import { reloadOnPreloadError } from '#/lib/chunk-reload';
import { themeScript } from '#/lib/theme';
import { useSessionRefresh } from '#/queries/auth';
import appCss from '#/styles.css?url';

interface MyRouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    head: () => ({
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
            { name: 'description', content: 'O Followw é uma nova forma de usar o SIGAA UnB.' },
            // Apenas as páginas públicas sobrescrevem esta regra para permitir indexação.
            { name: 'robots', content: 'noindex, follow' },
            { title: 'Followw' }
        ],
        links: [
            { rel: 'icon', href: '/favicon.svg' },
            { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
            { rel: 'manifest', href: '/manifest.json' },
            { rel: 'stylesheet', href: appCss }
        ]
    }),
    shellComponent: RootDocument,
    errorComponent: ErrorPage,
    component: RootComponent
});

function RootComponent() {
    useSessionRefresh();
    useEffect(() => reloadOnPreloadError(), []);
    useOfflineSupport();

    return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR" suppressHydrationWarning>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
                <HeadContent />
            </head>
            <body>
                <PostHogProvider>
                    {children}
                    <TanStackDevtools
                        config={{ position: 'bottom-right' }}
                        plugins={[
                            { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
                            TanStackQueryDevtools
                        ]}
                    />
                </PostHogProvider>
                <Scripts />
            </body>
        </html>
    );
}
