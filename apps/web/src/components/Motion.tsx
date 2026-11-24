import { AnimatePresence, LazyMotion, m, MotionConfig } from 'motion/react';

import { ease, slide } from '#/lib/motion';

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
