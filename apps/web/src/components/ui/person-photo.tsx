import { UserRound } from 'lucide-react';
import { useState } from 'react';

import { cn } from '#/lib/shadcn';

const WIDTHS = { sm: 'w-9', lg: 'w-20', xl: 'w-28' };

export function PersonPhoto({
    src,
    size = 'sm'
}: {
    src?: string | null;
    size?: keyof typeof WIDTHS;
}) {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);
    const hasError = Boolean(src && failedSrc === src);
    const className = cn('aspect-3/4 shrink-0 rounded-lg', WIDTHS[size]);

    if (src && !hasError) {
        return (
            <img
                src={src}
                alt=""
                className={cn(className, 'object-cover', size !== 'sm' && 'ring-1 ring-foreground/10')}
                onError={() => setFailedSrc(src)}
            />
        );
    }

    return (
        <div className={cn(className, 'flex items-center justify-center bg-primary/10 text-primary')}>
            <UserRound className={size === 'sm' ? 'size-4' : 'size-8'} aria-hidden="true" />
        </div>
    );
}
