import { STORAGE_KEYS, STORAGE_PREFIX, localStorageRepository } from '#/lib/local-storage';

export type Theme = 'system' | 'light' | 'dark';

const THEMES: Theme[] = ['system', 'light', 'dark'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

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
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

// Roda no <head> antes da hidratação para evitar o flash do tema errado e seguir o sistema.
export const themeScript = `(() => {
    const media = matchMedia('${DARK_QUERY}');
    const apply = () => {
        let theme;
        try { theme = JSON.parse(localStorage.getItem('${STORAGE_PREFIX}${STORAGE_KEYS.THEME}')); } catch {}
        const dark = theme === 'dark' || (theme !== 'light' && media.matches);
        document.documentElement.classList.toggle('dark', dark);
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
})();`;
