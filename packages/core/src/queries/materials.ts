import { apiClient } from './client.ts';

const DOWNLOAD_PATH = '/classrooms/{classroom_id}/posts/{post_id}/download';

export async function getMaterialDownload(classroomId: string, postId: string) {
    const { data, response } = await apiClient.POST(DOWNLOAD_PATH, {
        params: { path: { classroom_id: classroomId, post_id: postId } },
        parseAs: 'blob'
    });
    if (!data || data.size === 0) throw new Error(EMPTY_FILE_MESSAGE);
    return { blob: data, filename: materialFilename(response) };
}

/** Mesmo download em bytes, para runtimes sem Blob completo (Hermes). */
export async function getMaterialBytes(classroomId: string, postId: string) {
    const { data, response } = await apiClient.POST(DOWNLOAD_PATH, {
        params: { path: { classroom_id: classroomId, post_id: postId } },
        parseAs: 'arrayBuffer'
    });
    if (!data || data.byteLength === 0) throw new Error(EMPTY_FILE_MESSAGE);
    return {
        bytes: new Uint8Array(data),
        type: response.headers.get('content-type') ?? 'application/octet-stream',
        filename: materialFilename(response)
    };
}

const EMPTY_FILE_MESSAGE = 'O arquivo recebido está vazio.';

function materialFilename(response: Response) {
    const disposition = response.headers.get('content-disposition');
    const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (!encoded) throw new Error('O arquivo recebido não informa seu nome.');
    try {
        return decodeURIComponent(encoded);
    } catch {
        return encoded;
    }
}
