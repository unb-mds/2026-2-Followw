import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { api } from '#/queries/api.ts';
import { classroomsQueryOptions } from '#/queries/classrooms.ts';
import { meQueryOptions } from '#/queries/me.ts';

function clearUserData(queryClient: QueryClient) {
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

export function useLogout() {
    const queryClient = useQueryClient();
    return api.useMutation('delete', '/auth/sigaa', {
        onSuccess: () => clearSession(queryClient)
    });
}
