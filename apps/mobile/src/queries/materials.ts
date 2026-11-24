import { getMaterialBytes } from '@followw/core/queries/materials.ts';
import { useMutation } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Grava o arquivo do material no cache e abre a folha de compartilhamento. */
export async function shareMaterial(classroomId: string, postId: string) {
    const { bytes, type, filename } = await getMaterialBytes(classroomId, postId);
    const file = new File(Paths.cache, filename.replaceAll('/', '_'));
    file.create({ overwrite: true });
    await file.write(bytes);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível.');
    await Sharing.shareAsync(file.uri, { mimeType: type.split(';')[0], dialogTitle: filename });
}

export function useDownloadMaterial(classroomId: string, postId: string) {
    return useMutation({
        mutationKey: ['download-material', classroomId, postId],
        gcTime: 0,
        retry: false,
        mutationFn: () => shareMaterial(classroomId, postId)
    });
}
