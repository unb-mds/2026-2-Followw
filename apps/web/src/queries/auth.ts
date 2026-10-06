import { type Query, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { clearPersistedQueries } from '#/integrations/tanstack-query/persister';
import { useOnline } from '#/lib/online';
import { clearCachedPages } from '#/lib/service-worker';
import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

// tudo fora de /public/* é da conta; o /me fica a cargo de quem chama
const isAccountQuery = ({ queryKey: [, path] }: Query) =>
    typeof path === 'string' && !path.startsWith('/public/') && path !== '/me';

// o persister só regrava após o throttle: apagar já evita dado da conta no disco nesse intervalo
async function clearUserData(queryClient: QueryClient) {
    const cancelling = queryClient.cancelQueries({ predicate: isAccountQuery });
    queryClient.removeQueries({ predicate: isAccountQuery });
    // o HTML em cache traz dados do SSR
    await Promise.allSettled([cancelling, clearPersistedQueries(), clearCachedPages()]);
}

/** O estado em memória já sai na hora; a promise resolve quando o armazenamento local também saiu. */
export function clearSession(queryClient: QueryClient) {
    const cleared = clearUserData(queryClient);
    queryClient.setQueryData(meQueryOptions.queryKey, null);
    return cleared;
}

export function useLogin() {
    const queryClient = useQueryClient();
    // retorna a promise para o login seguir pendente até o perfil chegar
    return api.useMutation('post', '/auth/sigaa', {
        onSuccess: async () => {
            await clearUserData(queryClient);
            await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
        }
    });
}

export function useLogout(onLoggedOut?: () => void) {
    const queryClient = useQueryClient();
    return api.useMutation('delete', '/auth/sigaa', {
        onSuccess: async () => {
            await clearSession(queryClient);
            onLoggedOut?.();
        }
    });
}

let sessionRefreshed = false;

export function useSessionRefresh() {
    const queryClient = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    // offline espera a conexão voltar para renovar
    const online = useOnline();

    useEffect(() => {
        if (!user || !online || sessionRefreshed) return;
        sessionRefreshed = true;
        apiClient.POST('/auth/sigaa/refresh').catch((error: unknown) => {
            if (error instanceof ApiError && error.isUnauthorized) void clearSession(queryClient);
        });
    }, [user, online, queryClient]);
}
