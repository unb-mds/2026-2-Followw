import { useEffect, useState } from 'react';

import { cn } from '#/lib/shadcn';

const SESSION_KEY = 'followw_intro_seen';

interface BrandIntroProps {
    // Força exibição mesmo se já visualizada na sessão (útil para testes e preview)
    force?: boolean;
    onComplete?: () => void;
}

function shouldPlayIntro(force: boolean): boolean {
    if (typeof window === 'undefined') return force;
    if (force) return true;
    if (new URLSearchParams(window.location.search).has('intro')) return true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

    try {
        return !sessionStorage.getItem(SESSION_KEY);
    } catch {
        return false;
    }
}

export const BrandIntro: React.FC<BrandIntroProps> = ({ force = false, onComplete }) => {
    const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() =>
        shouldPlayIntro(force) ? 'in' : 'done'
    );

    useEffect(() => {
        if (phase !== 'in') {
            return () => {};
        }

        try {
            sessionStorage.setItem(SESSION_KEY, 'true');
        } catch {
            // Storage desabilitado
        }

        // Inicia a saída cinematográfica suave aos 2850ms
        const outTimer = window.setTimeout(() => {
            setPhase('out');
        }, 2850);

        // Desmonta totalmente aos 3300ms
        const doneTimer = window.setTimeout(() => {
            setPhase('done');
            onComplete?.();
        }, 3300);

        return () => {
            window.clearTimeout(outTimer);
            window.clearTimeout(doneTimer);
        };
    }, [phase, onComplete]);

    if (phase === 'done') {
        return null;
    }

    const isExiting = phase === 'out';

    // Toque na tela acelera a saída para quem estiver com pressa
    const handleSkip = () => {
        setPhase('out');
    };

    return (
        <aside
            aria-hidden="true"
            onClick={handleSkip}
            className={cn(
                'fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-background text-foreground transition-all duration-450 ease-out select-none',
                isExiting
                    ? 'pointer-events-none scale-[1.025] opacity-0 blur-[3px]'
                    : 'scale-100 opacity-100'
            )}
        >
            <style>{`
                /* Trajetórias cinéticas de precisão para as 4 asas geométricas */
                @keyframes intro-wing-tl {
                    0% {
                        transform: translate(-42px, -42px) scale(0.3) rotate(-16deg);
                        opacity: 0;
                        filter: blur(8px);
                    }
                    60% {
                        opacity: 1;
                        filter: blur(0px);
                    }
                    100% {
                        transform: translate(0, 0) scale(1) rotate(0deg);
                        opacity: 1;
                        filter: blur(0px);
                    }
                }

                @keyframes intro-wing-tr {
                    0% {
                        transform: translate(42px, -42px) scale(0.3) rotate(16deg);
                        opacity: 0;
                        filter: blur(8px);
                    }
                    60% {
                        opacity: 1;
                        filter: blur(0px);
                    }
                    100% {
                        transform: translate(0, 0) scale(1) rotate(0deg);
                        opacity: 1;
                        filter: blur(0px);
                    }
                }

                @keyframes intro-wing-bl {
                    0% {
                        transform: translate(-34px, 34px) scale(0.3) rotate(-12deg);
                        opacity: 0;
                        filter: blur(8px);
                    }
                    60% {
                        opacity: 1;
                        filter: blur(0px);
                    }
                    100% {
                        transform: translate(0, 0) scale(1) rotate(0deg);
                        opacity: 1;
                        filter: blur(0px);
                    }
                }

                @keyframes intro-wing-br {
                    0% {
                        transform: translate(34px, 34px) scale(0.3) rotate(12deg);
                        opacity: 0;
                        filter: blur(8px);
                    }
                    60% {
                        opacity: 1;
                        filter: blur(0px);
                    }
                    100% {
                        transform: translate(0, 0) scale(1) rotate(0deg);
                        opacity: 1;
                        filter: blur(0px);
                    }
                }

                /* Abertura lateral precisa do contêiner tipográfico */
                @keyframes intro-wordmark-reveal {
                    0%, 38% {
                        max-width: 0;
                        opacity: 0;
                    }
                    44% {
                        opacity: 0.3;
                    }
                    100% {
                        max-width: 260px;
                        opacity: 1;
                    }
                }

                /* Deslizamento suave e acomodação de kerning das letras */
                @keyframes intro-text-slide {
                    0%, 38% {
                        transform: translateX(-26px);
                        opacity: 0;
                        letter-spacing: 0.08em;
                    }
                    54% {
                        opacity: 1;
                    }
                    100% {
                        transform: translateX(0);
                        opacity: 1;
                        letter-spacing: -0.025em;
                    }
                }

                /* Ponto focal luminoso inicial de onde a marca nasce */
                @keyframes intro-focal-spark {
                    0% {
                        transform: scale(0);
                        opacity: 0;
                    }
                    40% {
                        transform: scale(1.6);
                        opacity: 0.9;
                    }
                    100% {
                        transform: scale(0.4);
                        opacity: 0;
                    }
                }

                /* Brilho especular sutil (shimmer) varrendo a marca */
                @keyframes intro-shimmer-sweep {
                    0%, 64% {
                        transform: translateX(-140%) skewX(-20deg);
                        opacity: 0;
                    }
                    70% {
                        opacity: 0.6;
                    }
                    86% {
                        opacity: 0.3;
                    }
                    100% {
                        transform: translateX(180%) skewX(-20deg);
                        opacity: 0;
                    }
                }

                /* Glow volumétrico ambiente que acompanha o surgimento */
                @keyframes intro-ambient-aura {
                    0% {
                        transform: scale(0.4);
                        opacity: 0;
                    }
                    45% {
                        transform: scale(1.25);
                        opacity: 0.8;
                    }
                    75% {
                        transform: scale(1);
                        opacity: 0.35;
                    }
                    100% {
                        transform: scale(1.05);
                        opacity: 0.25;
                    }
                }

                .intro-wing-tl {
                    transform-box: fill-box;
                    transform-origin: center;
                    animation: intro-wing-tl 1000ms cubic-bezier(0.16, 1, 0.3, 1) 60ms backwards;
                }
                .intro-wing-tr {
                    transform-box: fill-box;
                    transform-origin: center;
                    animation: intro-wing-tr 1000ms cubic-bezier(0.16, 1, 0.3, 1) 140ms backwards;
                }
                .intro-wing-bl {
                    transform-box: fill-box;
                    transform-origin: center;
                    animation: intro-wing-bl 1000ms cubic-bezier(0.16, 1, 0.3, 1) 220ms backwards;
                }
                .intro-wing-br {
                    transform-box: fill-box;
                    transform-origin: center;
                    animation: intro-wing-br 1000ms cubic-bezier(0.16, 1, 0.3, 1) 300ms backwards;
                }

                .intro-wordmark-container {
                    animation: intro-wordmark-reveal 2500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .intro-wordmark-text {
                    animation: intro-text-slide 2500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .intro-focal-spark {
                    animation: intro-focal-spark 800ms ease-out forwards;
                }
                .intro-shimmer-sweep {
                    animation: intro-shimmer-sweep 2600ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .intro-ambient-aura {
                    animation: intro-ambient-aura 2600ms ease-out forwards;
                }

                @media (prefers-reduced-motion: reduce) {
                    .intro-wing-tl,
                    .intro-wing-tr,
                    .intro-wing-bl,
                    .intro-wing-br,
                    .intro-wordmark-container,
                    .intro-wordmark-text,
                    .intro-focal-spark,
                    .intro-shimmer-sweep,
                    .intro-ambient-aura {
                        animation: none !important;
                        transform: none !important;
                        opacity: 1 !important;
                        max-width: none !important;
                    }
                }
            `}</style>

            <div className="relative flex items-center justify-center px-6">
                {/* Aura volumétrica ambiente suave adaptada para Light e Dark */}
                <div className="intro-ambient-aura pointer-events-none absolute size-60 rounded-full bg-primary/15 blur-3xl dark:bg-primary/20" />

                {/* Ponto focal de nascimento */}
                <div className="intro-focal-spark pointer-events-none absolute size-2 rounded-full bg-primary blur-xs" />

                {/* Lockup horizontal corporativo de alta tecnologia */}
                <div className="relative flex items-center">
                    {/* Ícone geométrico da marca com drop shadow adaptada ao tema */}
                    <div className="relative flex size-12 shrink-0 items-center justify-center sm:size-14">
                        <svg
                            viewBox="0 0 4446 4446"
                            className="size-full overflow-visible drop-shadow-[0_2px_12px_rgba(3,114,132,0.18)] dark:drop-shadow-[0_2px_16px_rgba(50,158,125,0.25)]"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-label="Logo Followw"
                        >
                            {/* Asa Superior Esquerda */}
                            <path
                                className="intro-wing-tl"
                                d="M670.917,2482.063c-71.625,12.2 -108.842,50.158 -110.121,-23.808c-1.579,-91.321 -10.717,-620.329 -0.404,-1141.637c4.221,-213.396 199.896,-173.354 578.971,-173.788c962.338,-1.096 969.504,-1.388 988.646,23.608c63.217,82.562 -119.225,953.017 -1155.833,1242.767c-93.171,26.042 -92.763,24.05 -301.263,72.85l0,0.004l0.004,0.004Z"
                                fill="#037284"
                            />
                            {/* Asa Superior Direita */}
                            <path
                                className="intro-wing-tr"
                                d="M3772.804,2481.7c-72.754,-14.8 -541.387,-110.113 -865.958,-333.767c-599.646,-413.204 -608.888,-951.387 -588.146,-979.625c15.892,-21.633 21.062,-27.054 868.071,-25.617c588.292,1 700.021,-39.396 699.825,207.35c-0.8,1019.442 2.158,1018.888 -0.513,1107.446c-2.258,74.904 -39.688,35.675 -113.271,24.208l-0.004,0.004l-0.004,0Z"
                                fill="#037284"
                            />
                            {/* Peça Inferior Esquerda */}
                            <path
                                className="intro-wing-bl"
                                d="M1391.867,2475.658c130.462,-80.817 535.171,-304.075 711.55,-769.196c22.171,-58.471 39.387,-23.413 39.283,-19.892c-22.2,772.812 -2.638,771.358 -7.692,1543.125c-0.587,89.608 -96.671,66.533 -240.442,68.017c-1223.846,12.621 -1245.688,15.396 -1307.692,-69.046c-39.817,-54.217 -42.871,-415.092 0.462,-431.017c254.796,-93.642 274.938,-42.563 804.525,-321.996l0.004,0.004Z"
                                fill="#329e7d"
                            />
                            {/* Peça Inferior Direita */}
                            <path
                                className="intro-wing-br"
                                d="M2578.012,2092.65c78.538,81.05 296.95,364.138 975.158,607.446c288.225,103.404 332.292,78.271 332.892,143.517c2.95,319.825 32.742,451.15 -195.883,453.446c-108.417,1.088 -1315.654,13.204 -1355.242,-7.279c-34.883,-18.05 -14.629,-252.133 -19.867,-949.617c-4.654,-619.425 -13.983,-682.138 17.233,-641.392c11.479,14.987 -1.508,20.654 110.158,208.7c58.821,99.05 62.696,95.058 135.546,185.179l0.004,-0Z"
                                fill="#339f7d"
                            />
                        </svg>
                    </div>

                    {/* Tipografia da marca desdobrando suavemente ao lado */}
                    <div className="intro-wordmark-container overflow-hidden">
                        <div className="intro-wordmark-text flex items-baseline pl-3.5 whitespace-nowrap sm:pl-4">
                            <span className="relative inline-block text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                                Followw
                                {/* Filete de luz especular (shimmer) calibrado para temas Claro e Escuro */}
                                <span
                                    aria-hidden="true"
                                    className="intro-shimmer-sweep pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-primary/30 to-transparent dark:via-white/35"
                                />
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
};
