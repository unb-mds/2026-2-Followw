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
