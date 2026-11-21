import { getMaterialDownload } from '@followw/core/queries/materials.ts';
import { useMutation } from '@tanstack/react-query';

import { saveFile } from '#/lib/download';

export function useDownloadMaterial(classroomId: string, postId: string) {
    return useMutation({
        mutationKey: ['download-material', classroomId, postId],
        gcTime: 0,
        retry: false,
        mutationFn: async () => {
            const { blob, filename } = await getMaterialDownload(classroomId, postId);
            saveFile(blob, filename);
        }
    });
}
