import { Spinner } from '#/components/ui/spinner';

export const LoadingText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="inline-flex items-center gap-2">
        <Spinner aria-hidden className="shrink-0" />
        {children}
    </span>
);
