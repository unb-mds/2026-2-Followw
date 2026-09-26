import type { QueryClient } from '@tanstack/react-query';

import { TanStackDevtools } from '@tanstack/react-devtools';
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import { AppLayout } from '#/components/AppLayout';
import PostHogProvider from '#/integrations/posthog/provider';
import TanStackQueryDevtools from '#/integrations/tanstack-query/devtools';
import appCss from '#/styles.css?url';

interface MyRouterContext {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
    head: () => ({
        meta: [
            {
                charSet: 'utf-8'
            },
            {
                name: 'viewport',
                content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no'
            },
            {
                title: 'Followw — Portal Acadêmico UnB'
            }
        ],
        links: [
            {
                rel: 'preconnect',
                href: 'https://fonts.googleapis.com'
            },
            {
                rel: 'preconnect',
                href: 'https://fonts.gstatic.com',
                crossOrigin: 'anonymous'
            },
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
            },
            {
                rel: 'stylesheet',
                href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200'
            },
            {
                rel: 'stylesheet',
                href: appCss
            }
        ]
    }),
    shellComponent: RootDocument,
    // Layout no root para a navbar não remontar entre rotas (e animar a troca de aba).
    component: () => (
        <AppLayout>
            <Outlet />
        </AppLayout>
    )
});

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
                        config={{
                            position: 'bottom-right'
                        }}
                        plugins={[
                            {
                                name: 'Tanstack Router',
                                render: <TanStackRouterDevtoolsPanel />
                            },
                            TanStackQueryDevtools
                        ]}
                    />
                </PostHogProvider>
                <Scripts />
            </body>
        </html>
    );
}
