import { FollowwLogo } from '#/components/ui/FollowwLogo';

interface HeaderBarProps {
    children?: React.ReactNode;
    showLogo?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
    children,
    showLogo = true,
}) => {
    return (
        <header className="flex items-center justify-between mb-4 pt-2 px-1">
            <div className="flex items-center gap-2.5">
                {showLogo && <FollowwLogo className="w-12 h-8 shrink-0" />}
                {children}
            </div>
        </header>
    );
};
