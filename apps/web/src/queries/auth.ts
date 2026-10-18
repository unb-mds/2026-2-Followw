import { usePostHog } from '@posthog/react';
import {
    type Query,
    type QueryClient,
    environmentManager,
    queryOptions,
    useQuery,
    useQueryClient
} from '@tanstack/react-query';

import { clearOfflineData } from '#/integrations/offline/storage';
import { useOnline } from '#/lib/online';
import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

// todo o cache é apagado no logout; só o /me fica a cargo de quem chama
const isAccountQuery = ({ queryKey: [, path] }: Query) => path !== '/me';

async function clearUserData(queryClient: QueryClient) {
    queryClient.removeQueries({ predicate: isAccountQuery });
    await clearOfflineData();
}

export function clearSession(queryClient: QueryClient) {
    const cleared = clearUserData(queryClient);
    queryClient.setQueryData(meQueryOptions.queryKey, null);
    return cleared;
}

/** O login deu certo, mas o /me seguinte não levou os cookies que ele gravou. */
export class SessionNotStoredError extends Error {
    constructor() {
        super('O navegador não guardou os cookies do login');
        this.name = 'SessionNotStoredError';
    }
}

/** Troca os dados da conta anterior pelo perfil da nova; falha se ele não vier. */
export async function startSession(queryClient: QueryClient) {
    await clearUserData(queryClient);
    // um /me em voo saiu sem os cookies do login, e o `query` o reaproveitaria
    await queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
    const user = await queryClient.query({ ...meQueryOptions, staleTime: 0 });
    if (!user) throw new SessionNotStoredError();
    return user;
}

export function useLogin() {
    const queryClient = useQueryClient();
    const posthog = usePostHog();
    // retorna a promise para o login seguir pendente até o perfil chegar
    return api.useMutation('post', '/auth/sigaa', {
        onSuccess: async () => {
            try {
                await startSession(queryClient);
            } catch (error) {
                if (error instanceof SessionNotStoredError) posthog.capture('login_session_lost');
                throw error;
            }
        }
    });
}

export function useLogout(onLoggedOut?: () => void) {
    const queryClient = useQueryClient();
    const posthog = usePostHog();
    return api.useMutation('delete', '/auth/sigaa', {
        onSuccess: async () => {
            await clearSession(queryClient);
            posthog.reset();
            onLoggedOut?.();
        }
    });
}

export function sessionRefreshQueryOptions(registration: string | undefined) {
    return queryOptions({
        queryKey: ['session-refresh', registration],
        queryFn: async ({ signal }) => {
            await apiClient.POST('/auth/sigaa/refresh', { signal });
            return true;
        },
        staleTime: Infinity,
        gcTime: 0,
        meta: { persist: false },
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.isUnauthorized),
        retryDelay: 60_000
    });
}

export function useSessionRefresh() {
    const { data: user } = useQuery(meQueryOptions);
    const online = useOnline();
    useQuery({
        ...sessionRefreshQueryOptions(user?.registration),
        enabled: !environmentManager.isServer() && !!user && online
    });
}
