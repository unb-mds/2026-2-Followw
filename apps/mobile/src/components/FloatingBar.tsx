import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { floatIn, floatOut } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Pílula flutuante acima da navegação (`bottom-24` do web); entra e sai animada. */
export function FloatingBar({
    open,
    label,
    className,
    children
}: {
    open: boolean;
    label: string;
    className?: string;
    children: React.ReactNode;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View
            pointerEvents="box-none"
            style={{ bottom: insets.bottom + 96 }}
            className="absolute inset-x-0 z-50 items-center"
        >
            {open && (
                <Animated.View
                    entering={floatIn}
                    exiting={floatOut}
                    accessibilityRole="toolbar"
                    accessibilityLabel={label}
                    className={cn(
                        'flex-row items-center gap-1 rounded-full border border-border bg-card p-1 shadow-lg shadow-black/10',
                        className
                    )}
                >
                    {children}
                </Animated.View>
            )}
        </View>
    );
}
