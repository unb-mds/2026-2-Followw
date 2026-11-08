import { useSyncExternalStore } from 'react';
import { Uniwind } from 'uniwind';

import { STORAGE_KEYS, storedValue } from '@/lib/storage';

export type Theme = 'system' | 'light' | 'dark';

const THEMES: Theme[] = ['system', 'light', 'dark'];

export const THEME_LABELS: Record<Theme, string> = {
    system: 'Sistema',
    light: 'Claro',
    dark: 'Escuro'
};

export function isTheme(value: unknown): value is Theme {
    return THEMES.some((theme) => theme === value);
}

export function nextTheme(theme: Theme): Theme {
    return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

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
