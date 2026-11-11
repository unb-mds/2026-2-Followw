import { useState, useSyncExternalStore } from 'react';

import { nowInBrasilia } from '#/lib/schedule';

type Now = ReturnType<typeof nowInBrasilia>;
const listeners = new Set<() => void>();
let current: Now | undefined;
let timer: ReturnType<typeof setInterval> | undefined;

function update() {
    current = nowInBrasilia();
    for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) {
        update();
        timer = setInterval(update, 30_000);
        window.addEventListener('focus', update);
        document.addEventListener('visibilitychange', update);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            clearInterval(timer);
            window.removeEventListener('focus', update);
            document.removeEventListener('visibilitychange', update);
            current = undefined;
        }
    };
}

export function useBrasiliaClock(initial?: Now) {
    const [fallback] = useState(() => initial ?? nowInBrasilia());
    return useSyncExternalStore(
        subscribe,
        () => current ?? fallback,
        () => fallback
    );
}
