import { apiClient } from '@followw/core/queries/client.ts';
import { ApiError } from '@followw/core/queries/errors.ts';
import { meQueryOptions } from '@followw/core/queries/me.ts';
import { refreshQuery } from '@followw/core/queries/refresh.ts';
import { noop, useMutation, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

/** Foto já cortada em JPEG, no arquivo local do app. */
export interface PickedPhoto {
    uri: string;
}

const PHOTO_FILE = { name: 'perfil.jpg', type: 'image/jpeg' } as const;

// no RN o FormData envia o arquivo pela URI; no web (só desenvolvimento) precisa do Blob
async function photoPart(photo: PickedPhoto): Promise<Blob> {
    if (Platform.OS === 'web') {
        // oxlint-disable-next-line no-restricted-globals -- lê a URI local da foto, não a API
        return (await fetch(photo.uri)).blob();
    }
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- formato de arquivo do FormData do RN
    return { uri: photo.uri, ...PHOTO_FILE } as unknown as Blob;
}

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
            photo: PickedPhoto | null;
        }) => {
            const part = photo && (await photoPart(photo));
            const { data } = await apiClient.PATCH('/me/profile', {
                body: { bio, photo_action: action },
                bodySerializer: () => {
                    const form = new FormData();
                    if (bio !== undefined) form.set('bio', bio);
                    form.set('photo_action', action);
                    if (part) form.append('photo', part, PHOTO_FILE.name);
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
