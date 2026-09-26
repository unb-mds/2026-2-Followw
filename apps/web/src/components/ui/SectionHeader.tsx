import React from 'react';

interface SectionHeaderProps {
    title: string;
    badge?: string | number;
    actionLabel?: string;
    onAction?: () => void;
    className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    badge,
    actionLabel,
    onAction,
    className = '',
}) => {
    return (
        <div className={`flex items-center justify-between mb-3 ${className}`}>
            <div className="flex items-center gap-2.5">
                <h2 className="text-[19px] font-bold text-[#243037] tracking-tight">{title}</h2>
                {badge !== undefined && (
                    <span className="text-[11.5px] font-bold text-[#007080] bg-[#1EA6A9]/10 px-2.5 py-0.5 rounded-full">
                        {badge}
                    </span>
                )}
            </div>
            {actionLabel && (
                <button
                    type="button"
                    onClick={onAction}
                    className="text-[12.5px] font-bold text-[#007080] hover:text-[#1EA6A9] transition-colors cursor-pointer"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};
