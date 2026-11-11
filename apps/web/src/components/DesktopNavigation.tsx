import { useQuery } from '@tanstack/react-query';
import { Link, useMatches } from '@tanstack/react-router';
import { House, Search, User, UserRoundGroup, Utensils } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { ThemeToggle } from '#/components/ThemeToggle';
import { useRestaurantShortcut } from '#/components/useRestaurantShortcut';
import { cn } from '#/lib/shadcn';
import { meQueryOptions } from '#/queries/me';

const items = [
    { to: '/', label: 'Início', icon: House },
    { to: '/turmas', label: 'Turmas', icon: UserRoundGroup },
    { to: '/ru', label: 'RU', icon: Utensils }
] as const;

export function DesktopNavigation() {
    const pathname = useMatches({ select: (matches) => matches.at(-1)?.pathname ?? '/' });
    const { data: user, isPending } = useQuery(meQueryOptions);
    const onRestaurantClick = useRestaurantShortcut(pathname);
    const profile = pathname === '/perfil';
    const searching = pathname === '/buscar';

    return (
        <div className="desktop-navigation sticky top-0 z-40 flex h-28 shrink-0 items-center justify-between gap-6 bg-background/95 px-10 backdrop-blur-xl">
            <div className="flex shrink-0 items-center gap-5">
                <Link
                    to="/"
                    aria-label="Followw, início"
                    className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
                >
                    <FollowwLogo className="size-10" />
                </Link>
                <nav
                    aria-label="Navegação principal do aplicativo"
                    className="flex items-center rounded-full border bg-muted/40 p-1.5 shadow-sm"
                >
                    {items.map(({ to, label, icon: Icon }) => {
                        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
                        return (
                            <Link
                                key={to}
                                to={to}
                                aria-label={label}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'desktop-nav-item flex size-12 items-center justify-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:transition-none',
                                    active && 'bg-primary/10 text-primary'
                                )}
                                onClick={to === '/ru' ? onRestaurantClick : undefined}
                            >
                                <Icon aria-hidden="true" className="size-5" />
                            </Link>
                        );
                    })}
                    <span
                        aria-hidden="true"
                        className={cn(
                            'h-12 transition-all duration-200 motion-reduce:transition-none',
                            searching ? 'w-0' : 'w-12'
                        )}
                    />
                    <div
                        data-desktop-search=""
                        className={cn(
                            'desktop-search-control text-muted-foreground',
                            searching && 'is-searching'
                        )}
                    >
                        {searching ? (
                            <span
                                aria-hidden="true"
                                className="flex size-12 items-center justify-center"
                            >
                                <Search className="size-5" />
                            </span>
                        ) : (
                            <Link
                                to="/buscar"
                                aria-label="Buscar"
                                className="flex size-12 items-center justify-center rounded-full transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:scale-95"
                            >
                                <Search aria-hidden="true" className="size-5" />
                            </Link>
                        )}
                    </div>
                </nav>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {profile && <ThemeToggle />}
                <Link
                    to="/perfil"
                    aria-label={user ? 'Perfil' : isPending ? 'Carregando conta' : 'Entrar'}
                    aria-current={profile ? 'page' : undefined}
                    className={cn(
                        'flex size-12 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                        profile && 'border-primary/30 bg-primary/10 text-primary'
                    )}
                >
                    <User aria-hidden="true" className="size-5" />
                </Link>
            </div>
        </div>
    );
}
