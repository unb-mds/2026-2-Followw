import { cn } from 'cn';

import { Spinner } from '#/components/ui/spinner';

export const LoadingText: React.FC<{ className?: string; children: React.ReactNode }> = ({
    className,
    children
}) => (
    <span className={cn('inline-flex items-center gap-2', className)}>
        <Spinner aria-hidden className="shrink-0" />
        {children}
    </span>
);
