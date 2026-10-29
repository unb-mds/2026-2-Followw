import { Link, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { Button, buttonVariants } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

interface HeaderBarProps {
    children?: React.ReactNode;
    // ações alinhadas à direita
    actions?: React.ReactNode;
    showLogo?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ children, actions, showLogo = true }) => {
    return (
        <header className="mb-2 flex items-center justify-between py-4 pb-2">
            <div className="flex items-center gap-2">
                {showLogo && <FollowwLogo className="size-10 shrink-0" />}
                {children}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
    );
};

export const HeaderTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h1 className="text-xl leading-none font-bold tracking-tight text-foreground">{children}</h1>
);

interface HeaderToggleProps {
    children: React.ReactNode;
    open: boolean;
    onToggle: () => void;
    title: string;
}

export const HeaderToggle: React.FC<HeaderToggleProps> = ({ children, open, onToggle, title }) => (
    <Button
        variant="ghost"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group h-auto justify-start gap-1 px-0 text-left"
        title={title}
    >
        <HeaderTitle>{children}</HeaderTitle>
        <ChevronDown
            className={cn(
                'size-4 text-muted-foreground transition-transform duration-200 group-hover:text-primary',
                open && 'rotate-180 text-primary'
            )}
        />
    </Button>
);

interface BackHeaderProps {
    to: string;
    title: string;
    ariaLabel?: string;
}

export function BackHeader({ to, title, ariaLabel = 'Voltar' }: BackHeaderProps) {
    const router = useRouter();
    const canGoBack = useCanGoBack();

    return (
        <HeaderBar showLogo={false}>
            <Link
                to={to}
                aria-label={ariaLabel}
                onClick={(event) => {
                    if (!canGoBack) return;
                    event.preventDefault();
                    router.history.back();
                }}
                className={buttonVariants({ variant: 'ghost', className: 'size-10' })}
            >
                <ArrowLeft className="size-5" />
            </Link>
            <HeaderTitle>{title}</HeaderTitle>
        </HeaderBar>
    );
}
