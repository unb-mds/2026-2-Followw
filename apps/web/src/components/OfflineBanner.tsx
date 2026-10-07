import { WifiOff } from 'lucide-react';

import { useOnline } from '#/lib/online';

export const OfflineBanner: React.FC = () => {
    const online = useOnline();
    if (online) return null;

    return (
        <output className="mb-4 flex items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
            <WifiOff className="size-4" aria-hidden="true" />
            Você está offline
        </output>
    );
};
