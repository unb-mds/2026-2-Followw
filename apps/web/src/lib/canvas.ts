/** O PNG do canvas; falha com `message` quando o navegador não gera o arquivo. */
export function canvasToPng(canvas: HTMLCanvasElement, message: string): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(message))), 'image/png')
    );
}

/** Corta `text` com reticências até caber segundo `fits`. */
export function ellipsize(text: string, fits: (text: string) => boolean) {
    if (fits(text)) return text;
    let cut = text;
    while (cut && !fits(`${cut}…`)) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
}

/** Tokens do tema (`--primary`) como cor CSS resolvida, com alfa, para SVG desenhado fora do DOM. */
export function resolvedThemeColors() {
    const theme = getComputedStyle(document.documentElement);
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = 1;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    const colors = new Map<string, string>();
    return (token: string) => {
        const value = theme.getPropertyValue(token).trim();
        if (!context) return value;
        const cached = colors.get(token);
        if (cached) return cached;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        const color = `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
        colors.set(token, color);
        return color;
    };
}
