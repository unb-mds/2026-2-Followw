import { usePostHog } from '@posthog/react';
import { type Query, type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { clearOfflineData } from '#/integrations/offline/storage';
import { useOnline } from '#/lib/online';
import { api } from '#/queries/api.ts';
import { apiClient } from '#/queries/client.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';

// só o que é público sobrevive à troca de conta; o /me fica a cargo de quem chama
const isAccountQuery = ({ queryKey: [, path] }: Query) =>
    !(typeof path === 'string' && (path.startsWith('/public/') || path === '/me'));

async function clearUserData(queryClient: QueryClient) {
    queryClient.removeQueries({ predicate: isAccountQuery });
    await clearOfflineData();
}

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
    const posthog = usePostHog();
    return api.useMutation('delete', '/auth/sigaa', {
        onSuccess: async () => {
            await clearSession(queryClient);
            posthog.reset();
            onLoggedOut?.();
        }
    });
}

let sessionRefreshed = false;

export function useSessionRefresh() {
    const queryClient = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);
    const online = useOnline();

    useEffect(() => {
        if (!user || !online || sessionRefreshed) return;
        sessionRefreshed = true;
        apiClient.POST('/auth/sigaa/refresh').catch((error: unknown) => {
            if (error instanceof ApiError && error.isUnauthorized) void clearSession(queryClient);
        });
    }, [user, online, queryClient]);
}
