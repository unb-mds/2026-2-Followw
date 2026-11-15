import type { Transition, Variants } from 'motion/react';

import { AnimatePresence, LazyMotion, m, MotionConfig } from 'motion/react';
import { useState, useSyncExternalStore } from 'react';

// Personalidade "corporate": curva única, molas com pouco bounce só em seleção e feedback.
export const ease = [0.2, 0, 0, 1] as const;
export const easeIn = [0.3, 0, 1, 1] as const;
export const spring: Transition = { type: 'spring', bounce: 0.15, visualDuration: 0.35 };
export const snappy: Transition = { type: 'spring', bounce: 0.1, visualDuration: 0.2 };

const loadFeatures = () => import('#/lib/motion-features').then((module) => module.default);

export function MotionProvider({ children }: { children: React.ReactNode }) {
    return (
        <LazyMotion features={loadFeatures} strict>
            <MotionConfig reducedMotion="user" transition={{ duration: 0.25, ease }}>
                {children}
            </MotionConfig>
        </LazyMotion>
    );
}

// Itens de lista: sobem em cascata, limitada a ~300ms independente do tamanho da lista.
export const rise: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: (index: number = 0) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.25, ease, delay: Math.min(index, 8) * 0.04 }
    })
};

// Troca lateral: entra do lado para onde se navegou (direction 1 ou -1).
export const slide: Variants = {
    enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
    center: { opacity: 1, x: 0 },
    exit: (direction: number) => ({
        opacity: 0,
        x: direction * -24,
        transition: { duration: 0.15, ease: easeIn }
    })
};

/** 1 ao avançar, -1 ao voltar e 0 na primeira posição conhecida. */
export function useSlideDirection(order?: string | number) {
    const [[previous, direction], setState] = useState<[typeof order, number]>([order, 0]);
    if (order !== previous) {
        const known = order !== undefined && previous !== undefined;
        setState([order, known ? (order > previous ? 1 : -1) : 0]);
    }
    return direction;
}

/** Troca o conteúdo com slide-fade lateral sempre que `id` muda. */
export function SlideSwitch({
    id,
    direction,
    className,
    children
}: {
    id: string;
    direction: number;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="relative">
            <AnimatePresence initial={false} mode="popLayout" custom={direction}>
                <m.div
                    key={id}
                    custom={direction}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className={className}
                >
                    {children}
                </m.div>
            </AnimatePresence>
        </div>
    );
}

const noop = () => () => {};

/** Anima a entrada só do que monta depois da hidratação; o HTML do SSR já chega visível. */
export function useEntrance() {
    const hydrated = useSyncExternalStore(
        noop,
        () => true,
        () => false
    );
    return { initial: hydrated ? 'hidden' : false, animate: 'show' } as const;
}
