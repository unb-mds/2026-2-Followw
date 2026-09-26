import React from 'react';

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
            className="relative w-11 h-11 rounded-full bg-white/80 border border-[#E4E7E7] shadow-sm flex items-center justify-center text-[#243037] hover:bg-[#E6FAF5] hover:text-[#1EA6A9] active:scale-95 transition-all cursor-pointer"
            aria-label="Abrir Notificações"
        >
            <span
                className={`material-symbols-outlined text-[24px] ${
                    unreadCount > 0 ? 'text-[#1EA6A9]' : 'text-[#243037]'
                }`}
            >
                {unreadCount > 0 ? 'notifications_active' : 'notifications'}
            </span>
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-[#1EA6A9] text-white text-[11px] font-bold flex items-center justify-center shadow-sm ring-2 ring-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};
