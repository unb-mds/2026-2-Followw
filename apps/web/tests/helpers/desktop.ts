import { DESKTOP_SPACE } from '#/lib/desktop';

export function desktopBrowser(readWidth: () => number) {
    const descriptors = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
        platform: 'Linux x86_64',
        maxTouchPoints: 0
    })) {
        descriptors.set(key, Object.getOwnPropertyDescriptor(navigator, key));
        Object.defineProperty(navigator, key, { value, configurable: true });
    }
    const original = window.matchMedia;
    const queries = new Set<MediaQueryList>();
    window.matchMedia = (query: string) => {
        const media = original.call(window, query);
        if (query === DESKTOP_SPACE || query === '(any-hover: hover) and (any-pointer: fine)') {
            Object.defineProperty(media, 'matches', {
                get: () => (query === DESKTOP_SPACE ? readWidth() >= 1200 : true)
            });
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
            for (const [key, descriptor] of descriptors) {
                if (descriptor) Object.defineProperty(navigator, key, descriptor);
                else Reflect.deleteProperty(navigator, key);
            }
        }
    };
}
