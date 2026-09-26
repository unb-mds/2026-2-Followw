interface NotificationBellProps {
    unreadCount?: number;
    onClick?: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
    unreadCount = 0,
    onClick,
}) => {
    return (
        <button
            type="button"
            onClick={onClick}
            className="relative w-11 h-11 rounded-full bg-white/80 border border-line shadow-sm flex items-center justify-center text-ink hover:bg-primary-light hover:text-primary active:scale-95 transition-all cursor-pointer"
            aria-label="Abrir Notificações"
        >
            <span
                className={`material-symbols-outlined text-2xl ${
                    unreadCount > 0 ? 'text-primary' : 'text-ink'
                }`}
            >
                {unreadCount > 0 ? 'notifications_active' : 'notifications'}
            </span>
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shadow-sm ring-2 ring-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};
