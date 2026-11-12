import type { Transition, Variants } from 'motion/react';

import { LazyMotion, MotionConfig } from 'motion/react';
import { useSyncExternalStore } from 'react';

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
