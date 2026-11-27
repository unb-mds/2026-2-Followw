import { api } from '@followw/core/queries/api.ts';
import { useQueryClient } from '@tanstack/react-query';

import { cancelAccountRequests, clearAccountData } from '#/queries/auth';

export function useDeleteAccountData(onDeleted: () => void) {
    const queryClient = useQueryClient();
    return api.useMutation('delete', '/me/data', {
        onMutate: () => cancelAccountRequests(queryClient),
        onSuccess: async () => {
            await clearAccountData(queryClient);
            onDeleted();
        }
    });
}
