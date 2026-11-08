import {
    documentRefusal,
    EMPTY_DOCUMENT_MESSAGE,
    studentDocuments,
    type StudentDocument
} from '@followw/core/lib/documents.ts';
import { apiClient } from '@followw/core/queries/client.ts';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export const PDF_MIME_TYPE = 'application/pdf';

export const DOWNLOAD_FAILURE_MESSAGE = 'Não foi possível baixar o documento. Tente novamente.';

export function documentFailureMessage(error: unknown): string {
    return documentRefusal(error) ?? DOWNLOAD_FAILURE_MESSAGE;
}

/** Baixa o PDF da API e grava no cache do app; devolve a URI do arquivo. */
export async function downloadDocument(document: StudentDocument): Promise<string> {
    const { data } = await apiClient.POST(`/me/${document}`, { parseAs: 'arrayBuffer' });
    if (!data || data.byteLength === 0) throw new Error(EMPTY_DOCUMENT_MESSAGE);
    const file = new File(Paths.cache, studentDocuments[document].filename);
    file.create({ overwrite: true });
    await file.write(new Uint8Array(data));
    return file.uri;
}

/** Baixa e abre a folha de compartilhamento (salvar em Arquivos, enviar, imprimir...). */
export async function shareDocument(document: StudentDocument) {
    const uri = await downloadDocument(document);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível.');
    await Sharing.shareAsync(uri, {
        mimeType: PDF_MIME_TYPE,
        UTI: 'com.adobe.pdf',
        dialogTitle: studentDocuments[document].label
    });
}
