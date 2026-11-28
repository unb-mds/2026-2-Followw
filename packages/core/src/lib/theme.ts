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
