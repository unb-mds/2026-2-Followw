import { Slot } from '@rn-primitives/slot';
import * as React from 'react';
import {
    type GestureResponderEvent,
    Modal,
    Pressable,
    type PressableProps,
    useWindowDimensions,
    View,
    type ViewProps
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { Text, TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

// mesmas curvas do drawer do web
const OPEN_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const CLOSE_EASING = Easing.bezier(0.32, 0.72, 0, 1);
const OPEN_MS = 450;
const CLOSE_MS = 400;

interface DrawerContextValue {
    open: boolean;
    setOpen: (open: boolean) => void;
    showSwipeHandle: boolean;
}

const DrawerContext = React.createContext<DrawerContextValue | null>(null);

function useDrawer() {
    const context = React.use(DrawerContext);
    if (!context) throw new Error('useDrawer must be used within a Drawer.');
    return context;
}

interface DrawerProps {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    showSwipeHandle?: boolean;
    children: React.ReactNode;
}

function Drawer({
    open: controlled,
    defaultOpen = false,
    onOpenChange,
    showSwipeHandle = false,
    children
}: DrawerProps) {
    const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
    const open = controlled ?? uncontrolled;
    const setOpen = React.useCallback(
        (next: boolean) => {
            if (controlled === undefined) setUncontrolled(next);
            onOpenChange?.(next);
        },
        [controlled, onOpenChange]
    );
    const value = React.useMemo(
        () => ({ open, setOpen, showSwipeHandle }),
        [open, setOpen, showSwipeHandle]
    );
    return <DrawerContext value={value}>{children}</DrawerContext>;
}

function DrawerTrigger({ asChild, onPress, ...props }: PressableProps & { asChild?: boolean }) {
    const { setOpen } = useDrawer();
    const Component = asChild ? Slot : Pressable;
    return (
        <Component
            onPress={(event: GestureResponderEvent) => {
                onPress?.(event);
                setOpen(true);
            }}
            {...props}
        />
    );
}

function DrawerClose({ asChild, onPress, ...props }: PressableProps & { asChild?: boolean }) {
    const { setOpen } = useDrawer();
    const Component = asChild ? Slot : Pressable;
    return (
        <Component
            onPress={(event: GestureResponderEvent) => {
                onPress?.(event);
                setOpen(false);
            }}
            {...props}
        />
    );
}

function DrawerSwipeHandle({ className, ...props }: ViewProps) {
    return (
        <View
            aria-hidden
            className={cn('h-3 w-full items-center justify-end', className)}
            {...props}
        >
            <View className="h-1 w-24 rounded-full bg-muted" />
        </View>
    );
}

/** Painel que sobe de baixo, como o `Drawer` do web; arraste para baixo ou toque fora para fechar. */
function DrawerContent({ className, children, ...props }: ViewProps) {
    const { open, setOpen, showSwipeHandle } = useDrawer();
    const { height: windowHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [mounted, setMounted] = React.useState(open);
    const height = useSharedValue(windowHeight);
    const offset = useSharedValue(windowHeight);

    if (open && !mounted) setMounted(true);

    React.useEffect(() => {
        if (!mounted) return;
        if (open) {
            offset.value = withTiming(0, { duration: OPEN_MS, easing: OPEN_EASING });
            return;
        }
        offset.value = withTiming(
            height.value,
            { duration: CLOSE_MS, easing: CLOSE_EASING },
            (finished) => {
                if (finished) scheduleOnRN(setMounted, false);
            }
        );
    }, [open, mounted, offset, height]);

    const close = () => setOpen(false);
    const pan = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-20, 20])
        .onChange((event) => {
            offset.value = Math.max(0, offset.value + event.changeY);
        })
        .onEnd((event) => {
            const dismiss = offset.value > height.value * 0.3 || event.velocityY > 800;
            if (dismiss) scheduleOnRN(close);
            else offset.value = withTiming(0, { duration: CLOSE_MS, easing: OPEN_EASING });
        });

    const popupStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
    const overlayStyle = useAnimatedStyle(() => ({
        opacity: interpolate(offset.value, [0, height.value], [1, 0], 'clamp')
    }));

    if (!mounted) return null;
    return (
        <Modal
            transparent
            visible
            statusBarTranslucent
            navigationBarTranslucent
            animationType="none"
            onRequestClose={close}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                <Animated.View style={overlayStyle} className="absolute inset-0 bg-black/10">
                    <Pressable
                        accessibilityLabel="Fechar"
                        className="flex-1"
                        onPress={close}
                    />
                </Animated.View>
                <GestureDetector gesture={pan}>
                    <Animated.View
                        accessibilityViewIsModal
                        onLayout={(event) => {
                            height.value = event.nativeEvent.layout.height;
                        }}
                        style={[
                            popupStyle,
                            { maxHeight: windowHeight - 96, paddingBottom: insets.bottom }
                        ]}
                        className={cn(
                            'absolute inset-x-0 bottom-0 rounded-t-xl border-t border-border bg-popover',
                            className
                        )}
                        {...props}
                    >
                        {showSwipeHandle && <DrawerSwipeHandle />}
                        <TextClassContext value="text-sm text-popover-foreground">
                            <View className="min-h-0 shrink">{children}</View>
                        </TextClassContext>
                    </Animated.View>
                </GestureDetector>
            </GestureHandlerRootView>
        </Modal>
    );
}

function DrawerHeader({ className, ...props }: ViewProps) {
    return <View className={cn('shrink-0 items-center gap-0.5 p-4 pb-0', className)} {...props} />;
}

function DrawerFooter({ className, ...props }: ViewProps) {
    return <View className={cn('mt-auto shrink-0 gap-2 p-4 pt-0', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof Text>) {
    return (
        <Text
            role="heading"
            aria-level={2}
            className={cn('text-center text-base font-medium text-foreground', className)}
            {...props}
        />
    );
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof Text>) {
    return (
        <Text className={cn('text-center text-sm text-muted-foreground', className)} {...props} />
    );
}

export {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerSwipeHandle,
    DrawerTitle,
    DrawerTrigger,
    useDrawer
};
