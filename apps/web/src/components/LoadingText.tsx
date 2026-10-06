import { LoaderCircle } from 'lucide-react';

export const LoadingText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-flex items-center gap-2">
        <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
        {children}
    </span>
);
