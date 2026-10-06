import { useLocation, useMatches } from '@tanstack/react-router';
import { createElement } from 'react';

import { BottomNavigation } from '#/components/BottomNavigation';
import { HeaderBar } from '#/components/HeaderBar';
import { PageStateProvider } from '#/components/PageState';

declare module '@tanstack/react-router' {
    interface StaticDataRouteOption {
        // header da página; sem ele, só o logo
        header?: React.FC;
    }
}

interface AppLayoutProps {
    children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
    const header =
        useMatches({ select: (matches) => matches.at(-1)?.staticData.header }) ?? HeaderBar;
    const pathname = useLocation({ select: (location) => location.pathname });

    return (
        <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
            <div className="mx-auto w-full max-w-2xl px-4">
                <PageStateProvider page={pathname}>
                    {createElement(header)}
                    <main className="flex-1 pb-24">{children}</main>
                </PageStateProvider>
                <BottomNavigation />
            </div>
        </div>
    );
};
