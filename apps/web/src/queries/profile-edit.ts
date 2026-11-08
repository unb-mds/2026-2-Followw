import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '#/queries/client';
import { meQueryOptions } from '#/queries/me';

export function useEditProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        retry: false,
        networkMode: 'always',
        gcTime: 0,
        mutationFn: async ({
            bio,
            action,
            photo
        }: {
            bio: string;
            action: 'keep' | 'replace' | 'remove';
            photo: File | null;
        }) => {
            const registration = queryClient.getQueryData(meQueryOptions.queryKey)?.registration;
            await queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
            const { data } = await apiClient.PATCH('/me/profile', {
                body: { bio, photo_action: action },
                bodySerializer: () => {
                    const form = new FormData();
                    form.set('bio', bio);
                    form.set('photo_action', action);
                    if (photo) form.set('photo', photo);
                    return form;
                }
            });
            if (!data) throw new Error('Resposta de perfil ausente');
            if (queryClient.getQueryData(meQueryOptions.queryKey)?.registration === registration) {
                queryClient.setQueryData(meQueryOptions.queryKey, data);
            }
            return data;
        }
    });
}
