import { STORAGE_KEYS } from '@followw/core/lib/storage-keys.ts';
import { isTheme, type Theme } from '@followw/core/lib/theme.ts';

import { STORAGE_PREFIX, localStorageRepository } from '#/lib/local-storage';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isDarkTheme(theme: Theme, systemDark: boolean): boolean {
    return theme === 'dark' || (theme === 'system' && systemDark);
}

export function readTheme(): Theme {
    const stored = localStorageRepository.get(STORAGE_KEYS.THEME);
    return isTheme(stored) ? stored : 'system';
}

const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function saveTheme(theme: Theme): void {
    if (theme === 'system') localStorageRepository.remove(STORAGE_KEYS.THEME);
    else localStorageRepository.set(STORAGE_KEYS.THEME, theme);
    for (const listener of listeners) listener();
}

export function applyTheme(theme: Theme): void {
    const dark = isDarkTheme(theme, window.matchMedia(DARK_QUERY).matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

// Roda no <head> antes da hidratação para evitar o flash do tema errado e seguir o sistema.
export const themeScript = `(() => {
    const media = matchMedia('${DARK_QUERY}');
    const apply = () => {
        let theme;
        try { theme = JSON.parse(localStorage.getItem('${STORAGE_PREFIX}${STORAGE_KEYS.THEME}')); } catch {}
        const dark = theme === 'dark' || (theme !== 'light' && media.matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
})();`;
