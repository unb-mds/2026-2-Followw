import {
    EMPTY_DOCUMENT_MESSAGE,
    studentDocuments,
    type StudentDocument
} from '@followw/core/lib/documents.ts';
import { apiClient } from '@followw/core/queries/client.ts';
import { useMutation } from '@tanstack/react-query';

import { saveFile } from '#/lib/download';

export async function getDocumentDownload(document: StudentDocument) {
    const { data } = await apiClient.POST(`/me/${document}`, { parseAs: 'blob' });
    if (!data || data.size === 0) throw new Error(EMPTY_DOCUMENT_MESSAGE);
    return { blob: data, filename: studentDocuments[document].filename };
}

export function useDownloadDocument() {
    return useMutation({
        mutationKey: ['download-document'],
        gcTime: 0,
        retry: false,
        mutationFn: async (document: StudentDocument) => {
            const { blob, filename } = await getDocumentDownload(document);
            saveFile(blob, filename);
        }
    });
}
