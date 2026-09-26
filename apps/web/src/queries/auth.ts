import { useQueryClient } from '@tanstack/react-query';

import { api } from '#/queries/api.ts';
import { classroomsQueryOptions } from '#/queries/classrooms.ts';
import { meQueryOptions } from '#/queries/me.ts';

export function useLogin() {
    const queryClient = useQueryClient();
    // retorna a promise para o login seguir pendente até o perfil chegar
    return api.useMutation('post', '/auth/sigaa', {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey })
    });
}

export function useLogout() {
    const queryClient = useQueryClient();
    return api.useMutation('delete', '/auth/sigaa', {
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: classroomsQueryOptions.queryKey });
            queryClient.setQueryData(meQueryOptions.queryKey, null);
        }
    });
}
