import { DESKTOP_QUERY } from '#/lib/desktop';

export function desktopBrowser(readWidth: () => number) {
    const original = window.matchMedia;
    const queries = new Set<MediaQueryList>();
    window.matchMedia = (query: string) => {
        const media = original.call(window, query);
        if (query === DESKTOP_QUERY) {
            Object.defineProperty(media, 'matches', { get: () => readWidth() >= 1024 });
            queries.add(media);
        }
        return media;
    };
    return {
        resize: () => {
            for (const query of queries) query.dispatchEvent(new Event('change'));
        },
        restore: () => {
            window.matchMedia = original;
        }
    };
}
