import { ChevronDown } from 'lucide-react';

import { FollowwLogo } from '#/components/ui/FollowwLogo';

interface HeaderBarProps {
    children?: React.ReactNode;
    showLogo?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ children, showLogo = true }) => {
    return (
        <header className="mb-2 flex items-center justify-between py-4 pb-2">
            <div className="flex items-center gap-2">
                {showLogo && <FollowwLogo className="h-6 w-10 shrink-0" />}
                {children}
            </div>
        </header>
    );
};

export const HeaderTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <h1 className="text-2xl leading-none font-bold tracking-tight text-ink transition-colors group-hover:text-primary">
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
    <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group flex cursor-pointer items-center gap-1 text-left select-none focus:outline-none"
        title={title}
    >
        <HeaderTitle>{children}</HeaderTitle>
        <ChevronDown
            className={`size-4 text-muted transition-transform duration-200 group-hover:text-primary ${
                open ? 'rotate-180 text-primary' : ''
            }`}
        />
    </button>
);
