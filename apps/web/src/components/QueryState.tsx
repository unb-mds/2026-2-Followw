import type { UseQueryResult } from '@tanstack/react-query';

import { ErrorCard } from '#/components/ErrorState';
import { LoadingText } from '#/components/LoadingText';
import { useOnline } from '#/lib/online';

interface QueryStateProps<T, E> {
    query: UseQueryResult<T, E>;
    loading: string;
    error: string;
    // falha ao atualizar com dados salvos; offline o aviso de conexão já cobre
    stale: string;
    className?: string;
    children?: (data: T) => React.ReactNode;
}

/** Carregando, falha inicial ou dados (com aviso se a atualização falhou). */
export function QueryState<T, E>({
    query,
    loading,
    error,
    stale,
    className,
    children
}: QueryStateProps<T, E>) {
    const online = useOnline();
    if (query.isPending) return <LoadingText className={className}>{loading}</LoadingText>;
    if (query.isLoadingError) return <ErrorCard message={error} onRetry={() => query.refetch()} />;
    return (
        <>
            {query.isError && online && (
                <ErrorCard message={stale} onRetry={() => query.refetch()} />
            )}
            {children?.(query.data)}
        </>
    );
}
