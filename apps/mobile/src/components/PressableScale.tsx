import { Pressable, type PressableProps } from 'react-native';
import {
    createAnimatedComponent,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';

import { snappy } from '@/lib/motion';

const AnimatedPressable = createAnimatedComponent(Pressable);

/** Encolhe levemente ao toque, como o `whileTap` dos cards do web. */
export function PressableScale({ onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style'>) {
    const scale = useSharedValue(1);
    const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <AnimatedPressable
            {...props}
            style={pressed}
            onPressIn={(event) => {
                scale.set(withSpring(0.98, snappy));
                onPressIn?.(event);
            }}
            onPressOut={(event) => {
                scale.set(withSpring(1, snappy));
                onPressOut?.(event);
            }}
        />
    );
}
