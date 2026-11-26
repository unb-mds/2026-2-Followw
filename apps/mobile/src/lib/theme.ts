import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import { isTheme, type Theme } from '@followw/core/lib/theme.ts';
import { useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

import { storedValue } from '@/lib/storage';

const themeStore = storedValue<Theme>(STORAGE_KEYS.THEME, 'system');

export function readTheme(): Theme {
    const stored = themeStore.getSnapshot();
    return isTheme(stored) ? stored : 'system';
}

export function setTheme(theme: Theme) {
    themeStore.set(theme);
    Uniwind.setTheme(theme);
}

/** Aplica no boot o tema salvo. */
export function applyStoredTheme() {
    Uniwind.setTheme(readTheme());
}

export function useThemePreference(): Theme {
    const stored = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot);
    return isTheme(stored) ? stored : 'system';
}
