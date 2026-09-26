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
                <h2 className="text-xl font-bold text-ink tracking-tight">{title}</h2>
                {badge !== undefined && (
                    <span className="text-xs font-bold text-primary-dark bg-primary/10 px-2.5 py-0.5 rounded-full">
                        {badge}
                    </span>
                )}
            </div>
            {actionLabel && (
                <button
                    type="button"
                    onClick={onAction}
                    className="text-xs font-bold text-primary-dark hover:text-primary transition-colors cursor-pointer"
                >
                    {actionLabel}
                </button>
            )}
        </div>
    );
};
