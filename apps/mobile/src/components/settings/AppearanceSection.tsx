import { View } from 'react-native';

import { ThemeToggle } from '@/components/ThemeToggle';
import { Text } from '@/components/ui/text';

export function AppearanceSection() {
    return (
        <View className="gap-3">
            <Text role="heading" aria-level={2} className="text-lg font-semibold">
                Aparência
            </Text>
            <View className="flex-row items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                <View className="min-w-0 flex-1">
                    <Text role="heading" aria-level={3} className="font-medium">
                        Tema
                    </Text>
                    <Text className="text-sm text-muted-foreground">
                        Alternar entre sistema, claro e escuro.
                    </Text>
                </View>
                <ThemeToggle />
            </View>
        </View>
    );
}
