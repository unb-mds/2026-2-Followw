import { api } from '@followw/core/queries/api.ts';
import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { type Query, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNetworkState } from 'expo-network';
import { useEffect } from 'react';

import { useAnalytics } from '@/lib/analytics';
import { clearTokens } from '@/lib/session';
import { clearAccountStorage, clearPersistedCache } from '@/lib/storage';

// todo o cache é apagado no logout; só o /me fica a cargo de quem chama
const isAccountQuery = ({ queryKey: [, path] }: Query) => path !== '/me';

function clearUserData(queryClient: QueryClient) {
    clearAccountStorage();
    queryClient.removeQueries({ predicate: isAccountQuery });
    clearPersistedCache();
}

export function clearSession(queryClient: QueryClient) {
    clearTokens();
    clearUserData(queryClient);
    queryClient.setQueryData(meQueryOptions.queryKey, null);
}

/** O login deu certo, mas o /me seguinte não levou os tokens que ele devolveu. */
export class SessionNotStoredError extends Error {
    constructor() {
        super('O aparelho não guardou a sessão do login');
        this.name = 'SessionNotStoredError';
    }
}

/** Troca os dados da conta anterior pelo perfil da nova; falha se ele não vier. */
export async function startSession(queryClient: QueryClient) {
    clearUserData(queryClient);
    await queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
    const user = await queryClient.query({ ...meQueryOptions, staleTime: 0 });
    if (!user) throw new SessionNotStoredError();
    return user;
}

export function useLogin() {
    const queryClient = useQueryClient();
    const analytics = useAnalytics();
    return api.useMutation('post', '/auth/sigaa', {
        onSuccess: async () => {
            try {
                await startSession(queryClient);
            } catch (error) {
                if (error instanceof SessionNotStoredError) analytics.capture('login_session_lost');
                throw error;
            }
        }
    });
}

export function useLogout(onLoggedOut?: () => void) {
    const queryClient = useQueryClient();
    const analytics = useAnalytics();
    return api.useMutation('delete', '/auth/sigaa', {
        // offline ou com a API fora, a sessão local sai do mesmo jeito
        onSettled: () => {
            clearSession(queryClient);
            analytics.reset();
            onLoggedOut?.();
        }
    });
}

// por matrícula: trocar de conta também renova
let refreshedRegistration: string | undefined;

export function useSessionRefresh() {
    const queryClient = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const { isConnected } = useNetworkState();

    useEffect(() => {
        if (!user || isConnected === false || refreshedRegistration === user.registration) return;
        refreshedRegistration = user.registration;
        apiClient.POST('/auth/sigaa/refresh').catch((error: unknown) => {
            if (error instanceof ApiError && error.isUnauthorized) clearSession(queryClient);
        });
    }, [user, isConnected, queryClient]);
}
