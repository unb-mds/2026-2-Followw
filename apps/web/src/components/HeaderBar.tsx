import { ChevronDown } from 'lucide-react';

import { FollowwLogo } from '#/components/FollowwLogo';
import { Button } from '#/components/ui/button';

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
            className={`size-4 text-muted-foreground transition-transform duration-200 group-hover:text-primary ${
                open ? 'rotate-180 text-primary' : ''
            }`}
        />
    </Button>
);
