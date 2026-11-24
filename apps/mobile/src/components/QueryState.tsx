import type { UseQueryResult } from '@tanstack/react-query';

import { useOnline } from '@followw/core/lib/online.ts';

import { ErrorCard } from '@/components/ErrorState';
import { LoadingSkeleton } from '@/components/LoadingSkeleton';
import { LoadingText } from '@/components/LoadingText';

interface QueryStateProps<T, E> {
    query: UseQueryResult<T, E>;
    loading: string;
    error: string;
    // falha ao atualizar com dados salvos; offline o aviso de conexão já cobre
    stale: string;
    // esboço do resultado; sem ele, o layout é incerto e fica o spinner
    skeleton?: React.ReactNode;
    className?: string;
    children?: (data: T) => React.ReactNode;
}

/** Carregando, falha inicial ou dados (com aviso se a atualização falhou). */
export function QueryState<T, E>({
    query,
    loading,
    error,
    stale,
    skeleton,
    className,
    children
}: QueryStateProps<T, E>) {
    const online = useOnline();
    if (query.isPending)
        return skeleton ? (
            <LoadingSkeleton label={loading}>{skeleton}</LoadingSkeleton>
        ) : (
            <LoadingText className={className}>{loading}</LoadingText>
        );
    if (query.isLoadingError)
        return <ErrorCard message={error} onRetry={() => void query.refetch()} />;
    return (
        <>
            {query.isError && online && (
                <ErrorCard message={stale} onRetry={() => void query.refetch()} />
            )}
            {children?.(query.data)}
        </>
    );
}
