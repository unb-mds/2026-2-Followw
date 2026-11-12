import { useLocation, useMatches } from '@tanstack/react-router';
import { m } from 'motion/react';
import { createElement } from 'react';

import { BottomNavigation } from '#/components/BottomNavigation';
import { DesktopContext } from '#/components/DesktopContext';
import { DesktopNavigation } from '#/components/DesktopNavigation';
import { HeaderBar } from '#/components/HeaderBar';
import { OfflineBanner } from '#/components/OfflineBanner';
import { PageStateProvider } from '#/components/PageState';
import { Toaster } from '#/components/ui/toast';
import { useDesktopEligibility } from '#/lib/desktop';
import { useEntrance } from '#/lib/motion';

// só opacidade: transform no <main> quebraria os elementos fixed das páginas durante a entrada
const page = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } };

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
    const rendered = useMatches({ select: (matches) => matches.at(-1)?.pathname });
    const entrance = useEntrance();

    const fullscreen = useMatches({
        select: (matches) => matches.at(-1)?.staticData.presentation === 'fullscreen'
    });
    return (
        <DesktopContext value={desktop}>
            <div
                className={
                    fullscreen
                        ? 'flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden'
                        : 'flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground lg:overflow-x-clip'
                }
            >
                {desktop && <DesktopNavigation />}
                <div
                    className={
                        fullscreen
                            ? 'flex min-h-0 flex-1 flex-col'
                            : 'app-content mx-auto w-full max-w-2xl px-4 lg:max-w-none lg:px-16 lg:pb-10'
                    }
                >
                    <PageStateProvider page={pathname}>
                        {!fullscreen && createElement(header)}
                        <OfflineBanner />
                        <m.main
                            key={rendered}
                            variants={page}
                            {...entrance}
                            className={
                                fullscreen ? 'flex min-h-0 flex-1 flex-col' : 'flex-1 pb-24 lg:pb-0'
                            }
                        >
                            {children}
                        </m.main>
                    </PageStateProvider>
                    {!fullscreen && !desktop && <BottomNavigation />}
                    <Toaster />
                </div>
            </div>
        </DesktopContext>
    );
};
