import { useEffect, useState } from 'react';
import { Easing } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';

const integer = (value: number) => Math.round(value).toLocaleString('pt-BR');
const ease = Easing.bezier(0.2, 0, 0, 1);
const DURATION = 600;

/** Conta de zero até `value` ao montar, como no web. */
export function AnimatedNumber({
    value,
    format = integer,
    className
}: {
    value: number;
    format?: (value: number) => string;
    className?: string;
}) {
    const reduced = useReducedMotion();
    const [shown, setShown] = useState(0);
    useEffect(() => {
        if (reduced) return undefined;
        let frame = 0;
        let from: number | null = null;
        const start = Date.now();
        const tick = () => {
            const progress = Math.min(1, (Date.now() - start) / DURATION);
            setShown((current) => {
                from ??= current;
                return from + (value - from) * ease(progress);
            });
            if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [value, reduced]);
    return <Text className={className}>{format(reduced ? value : shown)}</Text>;
}
