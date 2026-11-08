import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { captureScreen } from 'react-native-view-shot';
import { scheduleOnRN } from 'react-native-worklets';

import { setTheme, type Theme } from '@/lib/theme';

const FADE_MS = 300;

let startFade: ((theme: Theme) => Promise<void>) | null = null;

/** Troca o tema com fade: uma foto da tela cobre o re-render e some aos poucos. */
export function changeTheme(theme: Theme) {
    // no web não há captura de tela
    if (startFade && Platform.OS !== 'web') void startFade(theme);
    else setTheme(theme);
}

export function ThemeFade() {
    const [fade, setFade] = useState<{ uri: string; theme: Theme } | null>(null);
    const busy = useRef(false);
    const opacity = useSharedValue(1);

    useEffect(() => {
        startFade = async (theme) => {
            if (busy.current) return;
            busy.current = true;
            try {
                const uri = await captureScreen({ format: 'jpg', quality: 0.9 });
                opacity.value = 1;
                setFade({ uri, theme });
            } catch {
                busy.current = false;
                setTheme(theme);
            }
        };
        return () => {
            startFade = null;
        };
    }, [opacity]);

    const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

    if (!fade) return null;
    const finish = () => {
        busy.current = false;
        setFade(null);
    };
    // o tema só muda com a foto já na tela, e o fade começa depois do re-render
    const swap = () => {
        setTheme(fade.theme);
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                opacity.value = withTiming(0, { duration: FADE_MS }, (finished) => {
                    if (finished) scheduleOnRN(finish);
                });
            })
        );
    };

    return (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
            <Image
                source={{ uri: fade.uri }}
                style={StyleSheet.absoluteFill}
                fadeDuration={0}
                onLoad={swap}
            />
        </Animated.View>
    );
}
