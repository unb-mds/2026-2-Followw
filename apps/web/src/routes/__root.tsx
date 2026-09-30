import type { QueryClient } from '@tanstack/react-query';

import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';

import PostHogProvider from '#/integrations/posthog/provider';
import TanStackQueryDevtools from '#/integrations/tanstack-query/devtools';
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
            { name: 'description', content: 'O Followw é uma nova forma de usar o SIGAA UnB.' },
            { title: 'Followw' }
        ],
        links: [
            { rel: 'icon', href: '/favicon.svg' },
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
            },
            { rel: 'stylesheet', href: appCss }
        ]
    }),
    shellComponent: RootDocument,
    component: RootComponent
});

function RootComponent() {
    useSessionRefresh();

    return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="pt-BR">
            <head>
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
