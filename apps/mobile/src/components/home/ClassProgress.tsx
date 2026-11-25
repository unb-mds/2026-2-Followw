import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Trecho do trace do dia que enche com o andamento da aula; vermelho se houve falta. */
export function ClassProgress({ progress, absent }: { progress: number; absent: boolean }) {
    const fill = useSharedValue(progress);
    useEffect(() => {
        fill.value = withSpring(progress, spring);
    }, [fill, progress]);
    const style = useAnimatedStyle(() => ({ height: `${Math.round(fill.value * 100)}%` }));
    return (
        <View className="w-0.5 shrink-0 bg-muted">
            {/* absoluto: no Yoga, altura em % no fluxo estica a linha até a altura da tela */}
            <Animated.View
                className={cn('absolute inset-x-0 top-0', absent ? 'bg-destructive' : 'bg-primary')}
                style={style}
            />
        </View>
    );
}
