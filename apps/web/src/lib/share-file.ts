export async function prepareOrShareFile(
    file: File | undefined,
    prepare: () => Promise<File>,
    shareApi: Pick<Navigator, 'canShare' | 'share'> = navigator
): Promise<{ file: File; status: 'ready' | 'shared' | 'unsupported' }> {
    if (!file) return { file: await prepare(), status: 'ready' };
    const shared = await shareFile(file, shareApi);
    return { file, status: shared ? 'shared' : 'unsupported' };
}

export async function shareFile(
    file: File,
    shareApi: Pick<Navigator, 'canShare' | 'share'> = navigator
): Promise<boolean> {
    if (!shareApi.share || !shareApi.canShare?.({ files: [file] })) return false;

    try {
        await shareApi.share({ files: [file] });
        return true;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return true;
        throw error;
    }
}
