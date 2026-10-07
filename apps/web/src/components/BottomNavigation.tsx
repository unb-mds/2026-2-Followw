import { Link, useLocation } from '@tanstack/react-router';
import { House, User, type LucideIcon, Utensils, UserRoundGroup } from 'lucide-react';

import { cn } from '#/lib/shadcn';

interface NavItem {
    to: '/' | '/turmas' | '/ru' | '/perfil';
    label: string;
    icon: LucideIcon;
}

const navItems: NavItem[] = [
    { to: '/', label: 'Início', icon: House },
    { to: '/turmas', label: 'Turmas', icon: UserRoundGroup },
    { to: '/ru', label: 'RU', icon: Utensils },
    { to: '/perfil', label: 'Perfil', icon: User }
];

export const BottomNavigation: React.FC = () => {
    const location = useLocation();
    const pathname = location.pathname.replace(/(.)\/$/, '$1');
    const activeIndex = navItems.findIndex(
        (item) => item.to === pathname || (item.to === '/turmas' && pathname.startsWith('/turmas/'))
    );

    return (
        <nav
            className="fixed bottom-5 left-1/2 z-50 w-74 -translate-x-1/2 rounded-full border bg-card/80 px-1 py-1.5 text-card-foreground shadow-lg backdrop-blur-xl"
            aria-label="Navegação principal do aplicativo"
        >
            <div className="relative grid h-11 grid-cols-4">
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/4 px-1 transition-all duration-400 motion-reduce:transition-none"
                    style={{
                        transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`,
                        opacity: activeIndex === -1 ? 0 : 1,
                        transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)'
                    }}
                >
                    <div className="h-full rounded-full bg-primary/10 shadow-sm" />
                </div>
                {navItems.map((item, index) => {
                    const isActive = index === activeIndex;
                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                            className={cn(
                                'group relative flex h-full w-full items-center justify-center rounded-full px-1 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-90 motion-reduce:transition-none',
                                isActive ? 'text-primary' : 'text-muted-foreground'
                            )}
                        >
                            <span
                                aria-hidden="true"
                                className="absolute inset-x-1 inset-y-0 rounded-full transition-colors group-hover:bg-muted"
                            />
                            <item.icon
                                aria-hidden="true"
                                strokeWidth={isActive ? 2.5 : 2}
                                className={cn(
                                    'relative size-5 transition-transform duration-350 motion-reduce:transition-none',
                                    isActive && 'scale-110'
                                )}
                            />
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
};
