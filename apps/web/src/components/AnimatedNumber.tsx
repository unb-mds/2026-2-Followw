import { animate, m, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect } from 'react';

import { ease, useEntrance } from '#/lib/motion';

const integer = (value: number) => Math.round(value).toLocaleString('pt-BR');

/** Conta até `value` ao montar no cliente; o HTML do SSR já vem com o valor final. */
export function AnimatedNumber({
    value,
    format = integer
}: {
    value: number;
    format?: (value: number) => string;
}) {
    const fromZero = useEntrance().initial !== false;
    const count = useMotionValue(fromZero ? 0 : value);
    const text = useTransform(count, format);
    const reduced = useReducedMotion();

    useEffect(() => {
        if (reduced) return count.set(value);
        const controls = animate(count, value, { duration: 0.6, ease });
        return () => controls.stop();
    }, [count, value, reduced]);

    return <m.span>{text}</m.span>;
}
