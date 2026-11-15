import { AnimatePresence, m } from 'motion/react';

import { easeIn } from '#/lib/motion';

export function DayClock({ time }: { time: string }) {
    return (
        <time
            dateTime={time}
            aria-label={`Horário de Brasília: ${time}`}
            className="hidden text-2xl font-medium tabular-nums lg:flex"
        >
            {Array.from(time, (digit, index) => (
                <span key={index} className="relative inline-flex overflow-hidden">
                    <AnimatePresence initial={false} mode="popLayout">
                        <m.span
                            key={digit}
                            className="inline-block"
                            initial={{ y: '0.6em', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{
                                y: '-0.6em',
                                opacity: 0,
                                transition: { duration: 0.15, ease: easeIn }
                            }}
                        >
                            {digit}
                        </m.span>
                    </AnimatePresence>
                </span>
            ))}
        </time>
    );
}
