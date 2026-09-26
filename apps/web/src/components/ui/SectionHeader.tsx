import { Link, type LinkProps } from '@tanstack/react-router';

interface SectionHeaderProps {
    title: string;
    badge?: string | number;
    actionLabel?: string;
    actionTo?: LinkProps['to'];
    className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    badge,
    actionLabel,
    actionTo,
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
            {actionLabel && actionTo && (
                <Link
                    to={actionTo}
                    className="text-xs font-bold text-primary-dark hover:text-primary transition-colors"
                >
                    {actionLabel}
                </Link>
            )}
        </div>
    );
};
