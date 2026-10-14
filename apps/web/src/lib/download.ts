export function saveFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    try {
        link.click();
    } finally {
        link.remove();
        // Safari e PWA no iOS leem o blob depois do clique
        setTimeout(() => URL.revokeObjectURL(url), 40_000);
    }
}
