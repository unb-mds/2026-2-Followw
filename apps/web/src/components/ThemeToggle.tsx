import { Moon, Sun, SunMoon } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

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

    const toggle = (event: React.MouseEvent<HTMLButtonElement>) => {
        const next = nextTheme(theme);
        const commit = () => {
            flushSync(() => saveTheme(next));
            applyTheme(next);
        };
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!document.startViewTransition || reduceMotion) return commit();

        const rect = event.currentTarget.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        const transition = document.startViewTransition(commit);
        void transition.ready.then(() =>
            document.documentElement.animate(
                {
                    clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`]
                },
                {
                    duration: 500,
                    easing: 'ease-in-out',
                    pseudoElement: '::view-transition-new(root)'
                }
            )
        );
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
