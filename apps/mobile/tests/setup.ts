const mockMemory = new Map<string, Map<string, string>>();

jest.mock('react-native-mmkv', () => ({
    createMMKV: ({ id }: { id: string }) => {
        const store = mockMemory.get(id) ?? new Map<string, string>();
        mockMemory.set(id, store);
        return {
            getString: (key: string) => store.get(key),
            set: (key: string, value: string) => store.set(key, value),
            remove: (key: string) => store.delete(key),
            clearAll: () => store.clear()
        };
    }
}));

jest.mock('expo-secure-store', () => {
    const store = new Map<string, string>();
    return {
        AFTER_FIRST_UNLOCK: 0,
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        deleteItemAsync: async (key: string) => store.delete(key)
    };
});

// sem o runtime nativo dos worklets, as animações viram estilos estáticos
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
const mockPassthrough = (value: unknown) => value;
jest.mock('react-native-reanimated', () => {
    const { View, ScrollView, Text } = require('react-native');
    const chain: object = new Proxy(() => chain, { get: () => () => chain });
    const passthrough = mockPassthrough;
    return {
        __esModule: true,
        default: { View, ScrollView, Text, createAnimatedComponent: passthrough },
        createAnimatedComponent: passthrough,
        useSharedValue: (value: unknown) => ({ value }),
        useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
        useAnimatedStyle: () => ({}),
        useAnimatedProps: () => ({}),
        useReducedMotion: () => true,
        withSpring: passthrough,
        withTiming: passthrough,
        withRepeat: passthrough,
        cancelAnimation: () => {},
        withDelay: (_delay: number, value: unknown) => value,
        interpolate: (value: number) => value,
        Extrapolation: { CLAMP: 'clamp' },
        Easing: { bezier: () => passthrough },
        ReduceMotion: { System: 'system' },
        LayoutAnimationConfig: ({ children }: { children: unknown }) => children,
        FadeIn: chain,
        FadeOut: chain,
        LinearTransition: chain
    };
});
