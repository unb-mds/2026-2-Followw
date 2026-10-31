import { useLocation, useMatches } from '@tanstack/react-router';
import { createElement } from 'react';

import { BottomNavigation } from '#/components/BottomNavigation';
import { HeaderBar } from '#/components/HeaderBar';
import { OfflineBanner } from '#/components/OfflineBanner';
import { PageStateProvider } from '#/components/PageState';
import { Toaster } from '#/components/ui/toast';

declare module '@tanstack/react-router' {
    interface StaticDataRouteOption {
        // header da página; sem ele, só o logo
        header?: React.FC;
        presentation?: 'fullscreen';
    }
}

interface AppLayoutProps {
    children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
    const header =
        useMatches({ select: (matches) => matches.at(-1)?.staticData.header }) ?? HeaderBar;
    const pathname = useLocation({ select: (location) => location.pathname });

    const fullscreen = useMatches({
        select: (matches) => matches.at(-1)?.staticData.presentation === 'fullscreen'
    });
    if (fullscreen)
        return (
            <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
                <OfflineBanner />
                <main className="flex min-h-0 flex-1 flex-col">{children}</main>
                <Toaster />
            </div>
        );

    return (
        <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
            <div className="mx-auto w-full max-w-2xl px-4">
                <PageStateProvider page={pathname}>
                    {createElement(header)}
                    <OfflineBanner />
                    <main className="flex-1 pb-24">{children}</main>
                </PageStateProvider>
                <BottomNavigation />
                <Toaster />
            </div>
        </div>
    );
};
