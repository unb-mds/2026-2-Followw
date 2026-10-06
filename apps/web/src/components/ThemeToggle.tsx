import { Moon, Sun, SunMoon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import type { Theme } from '#/lib/theme';

import { Button } from '#/components/ui/button';
import {
    THEME_LABELS,
    applyTheme,
    nextTheme,
    readTheme,
    saveTheme,
    subscribeTheme
} from '#/lib/theme';

const ICONS: Record<Theme, React.FC<{ className?: string }>> = {
    system: SunMoon,
    light: Sun,
    dark: Moon
};

export const ThemeToggle: React.FC = () => {
    // No SSR não há localStorage: renderiza 'system' e o cliente corrige ao hidratar.
    const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'system' as const);

    const toggle = () => {
        const next = nextTheme(theme);
        saveTheme(next);
        applyTheme(next);
    };

    const Icon = ICONS[theme];
    const label = `Tema: ${THEME_LABELS[theme]}`;

    return (
        <Button
            variant="ghost"
            size="icon-lg"
            type="button"
            onClick={toggle}
            aria-label={`${label}. Alternar tema`}
            title={label}
        >
            <Icon className="size-5" />
        </Button>
    );
};
