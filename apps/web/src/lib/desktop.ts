import { useSyncExternalStore } from 'react';

// Mesmo limite do breakpoint lg do Tailwind.
export const DESKTOP_QUERY = '(min-width: 64rem)';

function snapshot() {
    return window.matchMedia(DESKTOP_QUERY).matches;
}

function subscribe(listener: () => void) {
    const query = window.matchMedia(DESKTOP_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
}

export function useDesktopEligibility() {
    return useSyncExternalStore(subscribe, snapshot, () => false);
}
