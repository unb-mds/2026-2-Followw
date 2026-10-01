import { useLocation, useMatches } from '@tanstack/react-router';
import { createElement } from 'react';

import { PageStateProvider } from '#/components/PageState';
import { BottomNavigation } from '#/components/ui/BottomNavigation';
import { HeaderBar } from '#/components/ui/HeaderBar';

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
        <div
            className="flex min-h-screen flex-col overflow-x-hidden bg-surface shadow-2xl"
            style={{
                backgroundImage:
                    'radial-gradient(circle at 50% -15%, rgba(4, 241, 236, 0.45) 0%, rgba(120, 218, 198, 0.38) 25%, rgba(30, 166, 169, 0.22) 55%, rgba(245, 250, 255, 0) 85%)',
                backgroundRepeat: 'no-repeat'
            }}
        >
            <div className="max-w-2xl w-full mx-auto px-4">
                <PageStateProvider page={pathname}>
                    {createElement(header)}
                    <main className="flex-1 pb-24">{children}</main>
                </PageStateProvider>
                <BottomNavigation />
            </div>
        </div>
    );
};
