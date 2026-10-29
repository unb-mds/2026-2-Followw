import { UserRound } from 'lucide-react';
import { useState } from 'react';

import { cn } from '#/lib/shadcn';

export function PersonPhoto({
    src,
    size = 'sm'
}: {
    src?: string | null;
    size?: 'sm' | 'lg';
}) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const hasError = Boolean(src && failedSrc === src);
    const className = cn('aspect-3/4 shrink-0 rounded-lg', size === 'lg' ? 'w-20' : 'w-9');

    if (src && !hasError) {
        return (
            <img
                src={src}
                alt=""
                className={cn(className, 'object-cover', size === 'lg' && 'ring-1 ring-foreground/10')}
                onError={() => setFailedSrc(src)}
            />
        );
    }

    return (
        <div className={cn(className, 'flex items-center justify-center bg-primary/10 text-primary')}>
            <UserRound className={size === 'lg' ? 'size-8' : 'size-4'} aria-hidden="true" />
        </div>
    );
}
