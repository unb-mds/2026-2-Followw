import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';

import { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Mede as opções e desliza um fundo até a ativa, como o `layoutId` do web. */
export function useSlidingHighlight(active: string | undefined) {
    const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
    const target = active === undefined ? undefined : layouts[active];
    const x = useSharedValue(target?.x ?? 0);
    const width = useSharedValue(target?.width ?? 0);
    const height = useSharedValue(target?.height ?? 0);
    const placed = useRef(false);

    useEffect(() => {
        if (!target) return;
        // a primeira posição aparece direto; as seguintes deslizam
        if (!placed.current) {
            x.value = target.x;
            width.value = target.width;
            height.value = target.height;
            placed.current = true;
            return;
        }
        x.value = withSpring(target.x, spring);
        width.value = withSpring(target.width, spring);
        height.value = withSpring(target.height, spring);
    }, [target, x, width, height]);

    const style = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }],
        width: width.value,
        height: height.value
    }));
    const measure = (key: string) => (event: LayoutChangeEvent) => {
        const layout = event.nativeEvent.layout;
        setLayouts((previous) => {
            const known = previous[key];
            if (known && known.x === layout.x && known.width === layout.width) return previous;
            return { ...previous, [key]: layout };
        });
    };
    return { style, measure, visible: Boolean(target) };
}

export function Highlight({
    highlight,
    top = 0,
    className
}: {
    highlight: ReturnType<typeof useSlidingHighlight>;
    // deslocamento vertical do contêiner (padding)
    top?: number;
    className?: string;
}) {
    return (
        <Animated.View
            pointerEvents="none"
            style={[highlight.style, { top, opacity: highlight.visible ? 1 : 0 }]}
            className={cn('absolute left-0', className)}
        />
    );
}
