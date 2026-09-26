import { BottomNavigation } from '#/components/ui/BottomNavigation';

interface AppLayoutProps {
    children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
    return (
        <div className="flex min-h-screen items-start justify-center bg-night font-sans antialiased selection:bg-mint selection:text-deep">
            <div
                className="relative flex min-h-screen w-full max-w-110 flex-col overflow-x-hidden bg-surface shadow-2xl"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 50% -15%, rgba(4, 241, 236, 0.45) 0%, rgba(120, 218, 198, 0.38) 25%, rgba(30, 166, 169, 0.22) 55%, rgba(245, 250, 255, 0) 85%)',
                    backgroundRepeat: 'no-repeat'
                }}
            >
                <main className="flex-1 px-4 pt-4 pb-28">{children}</main>
                <BottomNavigation />
            </div>
        </div>
    );
};
