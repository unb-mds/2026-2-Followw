import { Link, type LinkProps } from '@tanstack/react-router';

import { buttonVariants } from '#/components/ui/button';

interface SectionHeaderProps {
    title: string;
    actionLabel?: string;
    actionTo?: LinkProps['to'];
    className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
    title,
    actionLabel,
    actionTo,
    className = ''
}) => {
    return (
        <div className={`mb-3 flex items-center justify-between ${className}`}>
            <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
            </div>
            {actionLabel && actionTo && (
                <Link to={actionTo} className={buttonVariants({ variant: 'link', size: 'sm' })}>
                    {actionLabel}
                </Link>
            )}
        </div>
    );
};
