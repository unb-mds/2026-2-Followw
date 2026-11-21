import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { noop, useMutation, useQueryClient } from '@tanstack/react-query';

import { meQueryOptions } from '#/queries/me';
import { refreshQuery } from '#/queries/refresh';

export function useEditProfile() {
    const queryClient = useQueryClient();
    return useMutation({
        retry: false,
        networkMode: 'always',
        gcTime: 0,
        onMutate: async () => {
            const registration = queryClient.getQueryData(meQueryOptions.queryKey)?.registration;
            await queryClient.cancelQueries({ queryKey: meQueryOptions.queryKey });
            return registration;
        },
        mutationFn: async ({
            bio,
            action,
            photo
        }: {
            bio?: string;
            action: 'keep' | 'replace' | 'remove';
            photo: File | null;
        }) => {
            const { data } = await apiClient.PATCH('/me/profile', {
                body: { bio, photo_action: action },
                bodySerializer: () => {
                    const form = new FormData();
                    if (bio !== undefined) form.set('bio', bio);
                    form.set('photo_action', action);
                    if (photo) form.set('photo', photo);
                    return form;
                }
            });
            if (!data) throw new Error('Resposta de perfil ausente');
            return data;
        },
        onSuccess: (data, _variables, registration) => {
            if (queryClient.getQueryData(meQueryOptions.queryKey)?.registration === registration) {
                queryClient.setQueryData(meQueryOptions.queryKey, data);
            }
        },
        onError: (error, _variables, registration) => {
            if (error instanceof ApiError && !error.isServerError) return;
            if (
                registration &&
                queryClient.getQueryData(meQueryOptions.queryKey)?.registration === registration
            ) {
                // oxlint-disable-next-line promise/no-promise-in-callback -- a revalidação não atrasa o erro do PATCH
                void refreshQuery(queryClient, meQueryOptions, { retry: false }).catch(noop);
            }
        }
    });
}
