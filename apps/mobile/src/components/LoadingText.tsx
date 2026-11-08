import { ActivityIndicator, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useColor } from '@/lib/colors';
import { cn } from '@/lib/utils';

export function LoadingText({
    className,
    children
}: {
    className?: string;
    children: React.ReactNode;
}) {
    const color = useColor('muted-foreground');
    return (
        <View
            accessibilityRole="progressbar"
            className={cn('flex-row items-center justify-center gap-2 py-4', className)}
        >
            <ActivityIndicator color={color} />
            <Text className="text-sm text-muted-foreground">{children}</Text>
        </View>
    );
}
