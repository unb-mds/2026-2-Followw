import { useLocation, useMatches } from '@tanstack/react-router';
import { createElement } from 'react';

import { BottomNavigation } from '#/components/BottomNavigation';
import { DesktopContext } from '#/components/DesktopContext';
import { DesktopNavigation } from '#/components/DesktopNavigation';
import { HeaderBar } from '#/components/HeaderBar';
import { OfflineBanner } from '#/components/OfflineBanner';
import { PageStateProvider } from '#/components/PageState';
import { Toaster } from '#/components/ui/toast';
import { useDesktopEligibility } from '#/lib/desktop';

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
    const desktop = useDesktopEligibility();
    const header =
        useMatches({ select: (matches) => matches.at(-1)?.staticData.header }) ?? HeaderBar;
    const pathname = useLocation({ select: (location) => location.pathname });

    const fullscreen = useMatches({
        select: (matches) => matches.at(-1)?.staticData.presentation === 'fullscreen'
    });
    return (
        <DesktopContext value={desktop}>
            <div
                data-layout={desktop ? 'desktop' : 'mobile'}
                className={
                    fullscreen
                        ? 'flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden'
                        : 'flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground desktop:overflow-x-clip'
                }
            >
                {desktop && <DesktopNavigation />}
                <div
                    className={
                        fullscreen
                            ? 'flex min-h-0 flex-1 flex-col'
                            : 'app-content mx-auto w-full max-w-2xl px-4 desktop:max-w-none desktop:px-16 desktop:pb-10'
                    }
                >
                    <PageStateProvider page={pathname}>
                        {!fullscreen && createElement(header)}
                        <OfflineBanner />
                        <main
                            className={
                                fullscreen
                                    ? 'flex min-h-0 flex-1 flex-col'
                                    : 'flex-1 pb-24 desktop:pb-0'
                            }
                        >
                            {children}
                        </main>
                    </PageStateProvider>
                    {!fullscreen && !desktop && <BottomNavigation />}
                    <Toaster />
                </div>
            </div>
        </DesktopContext>
    );
};
