import { apiClient } from './client.ts';

export async function getMaterialDownload(classroomId: string, postId: string) {
    const { data, response } = await apiClient.POST(
        '/classrooms/{classroom_id}/posts/{post_id}/download',
        { params: { path: { classroom_id: classroomId, post_id: postId } }, parseAs: 'blob' }
    );
    if (!data || data.size === 0) throw new Error('O arquivo recebido está vazio.');
    const disposition = response.headers.get('content-disposition');
    const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    if (!encoded) throw new Error('O arquivo recebido não informa seu nome.');
    return { blob: data, filename: decodeFilename(encoded) };
}

function decodeFilename(encoded: string) {
    try {
        return decodeURIComponent(encoded);
    } catch {
        return encoded;
    }
}
