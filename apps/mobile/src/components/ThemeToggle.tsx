import { Moon, Sun, SunMoon } from 'lucide-react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { nextTheme, setTheme, THEME_LABELS, type Theme, useThemePreference } from '@/lib/theme';

const ICONS = { system: SunMoon, light: Sun, dark: Moon } satisfies Record<Theme, typeof Sun>;

export function ThemeToggle() {
    const theme = useThemePreference();
    return (
        <Button
            variant="ghost"
            size="icon-lg"
            accessibilityLabel={`Tema: ${THEME_LABELS[theme]}. Alternar tema`}
            onPress={() => setTheme(nextTheme(theme))}
        >
            <Icon as={ICONS[theme]} className="size-5" />
        </Button>
    );
}
