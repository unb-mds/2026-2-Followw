import { FollowwLogo } from '#/components/ui/FollowwLogo';
import { NotificationBell } from '#/components/ui/NotificationBell';

interface HeaderBarProps {
    children?: React.ReactNode;
    unreadCount?: number;
    onNotificationClick?: () => void;
    showLogo?: boolean;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
    children,
    unreadCount = 0,
    onNotificationClick,
    showLogo = true,
}) => {
    return (
        <header className="flex items-center justify-between mb-4 pt-2 px-1">
            <div className="flex items-center gap-2.5">
                {showLogo && <FollowwLogo className="w-12 h-8 shrink-0" />}
                {children}
            </div>
            <NotificationBell unreadCount={unreadCount} onClick={onNotificationClick} />
        </header>
    );
};
