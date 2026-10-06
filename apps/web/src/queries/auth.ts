import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '#/queries/api.ts';
import { classroomsQueryOptions } from '#/queries/classrooms.ts';
import { apiClient } from '#/queries/client.ts';
import { ApiError } from '#/queries/errors.ts';
import { meQueryOptions } from '#/queries/me.ts';
import { clearRestaurantAccount } from '#/queries/restaurant-account';
import { clearSettings } from '#/queries/settings';

function clearUserData(queryClient: QueryClient) {
    clearRestaurantAccount(queryClient);
    clearSettings(queryClient);
    queryClient.removeQueries({ queryKey: classroomsQueryOptions.queryKey });
}

export function clearSession(queryClient: QueryClient) {
    clearUserData(queryClient);
    queryClient.setQueryData(meQueryOptions.queryKey, null);
}

export function useLogin() {
    const queryClient = useQueryClient();
    // retorna a promise para o login seguir pendente até o perfil chegar
    return api.useMutation('post', '/auth/sigaa', {
        onSuccess: () => {
            clearUserData(queryClient);
            return queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
        }
    });
}

export function useLogout(onLoggedOut?: () => void) {
    const queryClient = useQueryClient();
    return api.useMutation('delete', '/auth/sigaa', {
        onSuccess: () => {
            clearSession(queryClient);
            onLoggedOut?.();
        }
    });
}

let sessionRefreshed = false;

export function useSessionRefresh() {
    const queryClient = useQueryClient();
    const { data: user } = useQuery(meQueryOptions);

    useEffect(() => {
        if (!user || sessionRefreshed) return;
        sessionRefreshed = true;
        apiClient.POST('/auth/sigaa/refresh').catch((error: unknown) => {
            if (error instanceof ApiError && error.isUnauthorized) clearSession(queryClient);
        });
    }, [user, queryClient]);
}
