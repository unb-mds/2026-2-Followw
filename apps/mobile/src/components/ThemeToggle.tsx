import { Moon, Sun, SunMoon } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { type EntryExitAnimationFunction, withSpring } from 'react-native-reanimated';

import { changeTheme } from '@/components/ThemeFade';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { spring } from '@/lib/motion';
import { nextTheme, THEME_LABELS, type Theme, useThemePreference } from '@/lib/theme';

const ICONS = { system: SunMoon, light: Sun, dark: Moon } satisfies Record<Theme, typeof Sun>;

// o ícone gira ao trocar de tema
const turn =
    (from: number, to: number, opacity: [number, number]): EntryExitAnimationFunction =>
    () => {
        'worklet';
        return {
            initialValues: {
                opacity: opacity[0],
                transform: [{ rotate: `${from}deg` }, { scale: from === 0 ? 1 : 0.6 }]
            },
            animations: {
                opacity: withSpring(opacity[1], spring),
                transform: [
                    { rotate: withSpring(`${to}deg`, spring) },
                    { scale: withSpring(to === 0 ? 1 : 0.6, spring) }
                ]
            }
        };
    };
const iconIn = turn(-90, 0, [0, 1]);
const iconOut = turn(0, 90, [1, 0]);

export function ThemeToggle() {
    const theme = useThemePreference();
    return (
        <Button
            variant="ghost"
            size="icon-lg"
            accessibilityLabel={`Tema: ${THEME_LABELS[theme]}. Alternar tema`}
            onPress={() => changeTheme(nextTheme(theme))}
        >
            <View className="size-5">
                <Animated.View key={theme} entering={iconIn} exiting={iconOut} className="absolute">
                    <Icon as={ICONS[theme]} className="size-5" />
                </Animated.View>
            </View>
        </Button>
    );
}
