import { useQuery } from '@tanstack/react-query';
import { Link, useMatches } from '@tanstack/react-router';
import { House, Search, User, UserRoundGroup, Utensils } from 'lucide-react';
import { m } from 'motion/react';
import { useState } from 'react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { ThemeToggle } from '#/components/ThemeToggle';
import { useRestaurantShortcut } from '#/components/useRestaurantShortcut';
import { ease, spring } from '#/lib/motion';
import { cn } from '#/lib/shadcn';
import { meQueryOptions } from '#/queries/me';

const items = [
    { to: '/', label: 'Início', icon: House },
    { to: '/turmas', label: 'Turmas', icon: UserRoundGroup },
    { to: '/ru', label: 'RU', icon: Utensils }
] as const;

// largura fixa: o controle de busca (fixed) depende dela em styles.css
const itemClass =
    'relative flex h-12 w-28 items-center justify-center gap-2 rounded-full text-sm font-medium transition-[color,background-color,scale] duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring active:scale-95 motion-reduce:transition-none';

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
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    itemClass,
                                    active
                                        ? 'text-primary hover:bg-transparent'
                                        : 'text-muted-foreground'
                                )}
                                onClick={to === '/ru' ? onRestaurantClick : undefined}
                            >
                                {active && (
                                    <m.span
                                        layoutId="desktop-navigation-pill"
                                        aria-hidden="true"
                                        className="absolute inset-0 rounded-full bg-primary/10"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={spring}
                                    />
                                )}
                                <Icon aria-hidden="true" className="relative size-5" />
                                <span className="relative">{label}</span>
                            </Link>
                        );
                    })}
                    <m.span
                        aria-hidden="true"
                        className="h-12"
                        initial={false}
                        animate={{ width: searching ? 0 : 112 }}
                        transition={{ duration: 0.2, ease }}
                    />
                    <m.div
                        layout="position"
                        data-desktop-search=""
                        className={cn(
                            'desktop-search-control text-muted-foreground',
                            searching && 'is-searching'
                        )}
                        initial={false}
                        animate={{ opacity: searching ? 0 : 1 }}
                        transition={{ duration: 0.22, ease }}
                    >
                        {searching ? (
                            <span aria-hidden="true" className={itemClass}>
                                <Search className="size-5" />
                            </span>
                        ) : (
                            <Link to="/buscar" className={itemClass}>
                                <Search aria-hidden="true" className="size-5" />
                                Buscar
                            </Link>
                        )}
                    </m.div>
                </nav>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {profile && <ThemeToggle />}
                <Link
                    to="/perfil"
                    aria-label={user ? 'Perfil' : isPending ? 'Carregando conta' : 'Entrar'}
                    aria-current={profile ? 'page' : undefined}
                    className={cn(
                        'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted/40 text-muted-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
                        profile &&
                            'border-primary/30 bg-primary/10 text-primary ring-2 ring-primary/40'
                    )}
                >
                    <ProfilePhoto src={user?.photo} />
                </Link>
            </div>
        </div>
    );
}

function ProfilePhoto({ src }: { src?: string | null }) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    if (!src || failedSrc === src) return <User aria-hidden="true" className="size-5" />;
    return (
        <img
            src={src}
            alt=""
            className="size-full object-cover"
            onError={() => setFailedSrc(src)}
        />
    );
}
