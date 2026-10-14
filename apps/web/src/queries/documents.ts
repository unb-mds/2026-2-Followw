import { useMutation } from '@tanstack/react-query';

import { saveFile } from '#/lib/download';
import { apiClient } from '#/queries/client';

export const studentDocuments = {
    'student-card': { label: 'Carteirinha estudantil', filename: 'carteirinha.pdf' },
    transcript: { label: 'Histórico acadêmico', filename: 'historico.pdf' }
} as const;

export type StudentDocument = keyof typeof studentDocuments;

export async function getDocumentDownload(document: StudentDocument) {
    const { data } = await apiClient.POST(`/me/${document}`, { parseAs: 'blob' });
    if (!data || data.size === 0) throw new Error('O documento recebido está vazio.');
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
