import { Link, type LinkProps, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ArrowLeft, ChevronDown } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { Button, buttonVariants } from '#/components/ui/button';
import { cn } from '#/lib/shadcn';

interface HeaderBarProps {
    children?: React.ReactNode;
    // ações alinhadas à direita
    actions?: React.ReactNode;
    showLogo?: boolean;
    // a topbar do desktop já identifica a página
    hideOnDesktop?: boolean;
    // fixa sob a topbar ao rolar no desktop
    sticky?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
    children,
    actions,
    showLogo = true,
    hideOnDesktop = false,
    sticky = false
}) => {
    return (
        <header
            className={cn(
                'mb-2 flex items-center justify-between py-4 pb-2 lg:mb-4 lg:gap-8 lg:pt-2',
                hideOnDesktop && 'lg:hidden',
                sticky && 'lg:sticky lg:top-28 lg:z-30 lg:bg-background'
            )}
        >
            <div className="flex items-center gap-2">
                {showLogo && <FollowwLogo className="size-10 shrink-0 lg:hidden" />}
                {children}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
    );
};

export const HeaderTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h1 className="text-xl leading-none font-bold tracking-tight text-foreground lg:text-2xl lg:font-medium">
        {children}
    </h1>
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
    to: LinkProps['to'];
    title: string;
    ariaLabel?: string;
    sticky?: boolean;
}

export function BackHeader({ to, title, ariaLabel = 'Voltar', sticky }: BackHeaderProps) {
    const router = useRouter();
    const canGoBack = useCanGoBack();

    return (
        <HeaderBar showLogo={false} sticky={sticky}>
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
