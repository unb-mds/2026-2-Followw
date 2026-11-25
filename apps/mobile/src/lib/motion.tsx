import { type ReactNode, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    LinearTransition,
    useAnimatedStyle,
    useSharedValue,
    type EntryExitAnimationFunction,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
    type WithSpringConfig
} from 'react-native-reanimated';

// Mesma personalidade do web: curva única, molas com pouco bounce só em seleção e feedback.
export const ease = Easing.bezier(0.2, 0, 0, 1);
export const easeIn = Easing.bezier(0.3, 0, 1, 1);
export const spring: WithSpringConfig = { duration: 350, dampingRatio: 0.85 };
export const snappy: WithSpringConfig = { duration: 200, dampingRatio: 0.9 };
const DURATION = 250;

/** Itens de lista: sobem em cascata, limitada a ~300ms independente do tamanho da lista. */
export function rise(index = 0): EntryExitAnimationFunction {
    const delay = Math.min(index, 8) * 40;
    return () => {
        'worklet';
        return {
            initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
            animations: {
                opacity: withDelay(delay, withTiming(1, { duration: DURATION, easing: ease })),
                transform: [
                    {
                        translateY: withDelay(
                            delay,
                            withTiming(0, { duration: DURATION, easing: ease })
                        )
                    }
                ]
            }
        };
    };
}

/** Troca lateral: entra do lado para onde se navegou (direction 1 ou -1). */
export function slideIn(direction: number): EntryExitAnimationFunction {
    return () => {
        'worklet';
        return {
            initialValues: { opacity: 0, transform: [{ translateX: direction * 24 }] },
            animations: {
                opacity: withTiming(1, { duration: DURATION, easing: ease }),
                transform: [{ translateX: withTiming(0, { duration: DURATION, easing: ease }) }]
            }
        };
    };
}

// a saída só esmaece: o elemento que sai não recebe a nova direção
export const fadeOut: EntryExitAnimationFunction = () => {
    'worklet';
    return {
        initialValues: { opacity: 1 },
        animations: { opacity: withTiming(0, { duration: 150, easing: easeIn }) }
    };
};

/** Pílula flutuante: sobe com mola ao abrir e desce rápido ao fechar. */
export const floatIn: EntryExitAnimationFunction = () => {
    'worklet';
    return {
        initialValues: { opacity: 0, transform: [{ translateY: 16 }, { scale: 0.96 }] },
        animations: {
            opacity: withSpring(1, spring),
            transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }]
        }
    };
};

export const floatOut: EntryExitAnimationFunction = () => {
    'worklet';
    return {
        initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
        animations: {
            opacity: withTiming(0, { duration: 150, easing: easeIn }),
            transform: [{ translateY: withTiming(12, { duration: 150, easing: easeIn }) }]
        }
    };
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

/** Troca o conteúdo com slide-fade lateral sempre que `id` muda; sem direção (ao montar), não desliza. */
export function SlideSwitch({
    id,
    direction,
    className,
    children
}: {
    id: string;
    direction: number;
    className?: string;
    children: ReactNode;
}) {
    return (
        <View className="relative">
            <Animated.View
                key={id}
                entering={direction ? slideIn(direction) : undefined}
                exiting={fadeOut}
                className={className}
            >
                {children}
            </Animated.View>
        </View>
    );
}

/** Item de lista que sobe em cascata ao montar. */
export function Rise({
    index = 0,
    animate = true,
    className,
    children
}: {
    index?: number;
    // falso quando outra animação (troca lateral) já cuida da entrada
    animate?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Animated.View entering={animate ? rise(index) : undefined} className={className}>
            {children}
        </Animated.View>
    );
}

/** Item que entra subindo, sai encolhendo e se reposiciona com mola (lista da grade). */
export const listItem = {
    entering: (() => {
        'worklet';
        return {
            initialValues: { opacity: 0, transform: [{ translateY: 8 }] },
            animations: {
                opacity: withSpring(1, spring),
                transform: [{ translateY: withSpring(0, spring) }]
            }
        };
    }) satisfies EntryExitAnimationFunction,
    exiting: (() => {
        'worklet';
        return {
            initialValues: { opacity: 1, transform: [{ scale: 1 }] },
            animations: {
                opacity: withTiming(0, { duration: 150, easing: easeIn }),
                transform: [{ scale: withTiming(0.96, { duration: 150, easing: easeIn }) }]
            }
        };
    }) satisfies EntryExitAnimationFunction,
    layout: LinearTransition.springify().dampingRatio(0.85).duration(350)
};

/** Gira o conteúdo até `degrees` quando `turned`, como o `transition-transform` do web. */
export function Turn({
    turned,
    degrees = 180,
    duration = 200,
    children
}: {
    turned: boolean;
    degrees?: number;
    duration?: number;
    children: ReactNode;
}) {
    const angle = useSharedValue(turned ? degrees : 0);
    useEffect(() => {
        angle.value = withTiming(turned ? degrees : 0, { duration, easing: ease });
    }, [angle, turned, degrees, duration]);
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
    return <Animated.View style={style}>{children}</Animated.View>;
}

/** Gira sem parar enquanto `active` (`animate-spin`). */
export function Spin({ active, children }: { active: boolean; children: ReactNode }) {
    const angle = useSharedValue(0);
    useEffect(() => {
        if (!active) {
            cancelAnimation(angle);
            angle.value = 0;
            return;
        }
        angle.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1);
    }, [active, angle]);
    const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
    return <Animated.View style={style}>{children}</Animated.View>;
}

/** Pulsa a opacidade sem parar (`animate-pulse`). */
export function Pulse({ className }: { className?: string }) {
    const opacity = useSharedValue(1);
    useEffect(() => {
        opacity.value = withRepeat(
            withTiming(0.5, { duration: 1000, easing: Easing.bezier(0.4, 0, 0.6, 1) }),
            -1,
            true
        );
        return () => cancelAnimation(opacity);
    }, [opacity]);
    const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
    return <Animated.View style={style} className={className} />;
}
