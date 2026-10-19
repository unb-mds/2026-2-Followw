import { usePostHog } from '@posthog/react';
import { type Query, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

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

// por matrícula: outra conta na mesma aba também renova
let refreshedRegistration: string | undefined;

export function useSessionRefresh() {
    const queryClient = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const online = useOnline();

    useEffect(() => {
        if (!user || !online || refreshedRegistration === user.registration) return;
        refreshedRegistration = user.registration;
        apiClient.POST('/auth/sigaa/refresh').catch((error: unknown) => {
            if (error instanceof ApiError && error.isUnauthorized) void clearSession(queryClient);
        });
    }, [user, online, queryClient]);
}
