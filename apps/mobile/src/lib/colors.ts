import { type Theme as NavigationTheme, DarkTheme, DefaultTheme } from 'expo-router';
import { useCSSVariable, useUniwind } from 'uniwind';

/** Cor de um token do tema (`primary`, `muted-foreground`...) para props que não aceitam className. */
export function useColor(token: string): string {
    const value = useCSSVariable(`--color-${token}`);
    return typeof value === 'string' ? value : '';
}

/** Tema do React Navigation (headers, tab bar, fundo das telas) com os tokens do app. */
export function useNavigationTheme(): NavigationTheme {
    const { theme } = useUniwind();
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    const colors = {
        primary: useColor('primary'),
        background: useColor('background'),
        card: useColor('background'),
        text: useColor('foreground'),
        border: useColor('border'),
        notification: useColor('destructive')
    };
    return { ...base, colors: { ...base.colors, ...colors } };
}
