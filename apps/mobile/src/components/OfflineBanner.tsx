import { useOnline } from '@followw/core/lib/online.ts';
import { WifiOff } from 'lucide-react-native';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function OfflineBanner() {
    const online = useOnline();
    if (online) return null;
    return (
        <View
            accessibilityRole="alert"
            className="flex-row items-center justify-center gap-2 rounded-xl bg-muted px-3 py-2"
        >
            <Icon as={WifiOff} className="size-4 text-muted-foreground" />
            <Text className="text-xs font-semibold text-muted-foreground">Você está offline</Text>
        </View>
    );
}
