import { CalendarDays } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Atalho flutuante para voltar ao dia atual depois de escolher outro. */
export function BackToTodayBar({ open, onBack }: { open: boolean; onBack: () => void }) {
    const insets = useSafeAreaInsets();
    if (!open) return null;
    return (
        <View
            pointerEvents="box-none"
            style={{ bottom: insets.bottom + 96 }}
            className="absolute inset-x-0 z-50 items-center"
        >
            <View
                accessibilityRole="toolbar"
                accessibilityLabel="Dia selecionado"
                className="flex-row items-center rounded-full border border-border bg-card p-1 shadow-lg shadow-black/10"
            >
                <Button variant="ghost" size="sm" className="rounded-full" onPress={onBack}>
                    <Icon as={CalendarDays} className="size-4 text-primary" />
                    <Text className="text-primary">Voltar para hoje</Text>
                </Button>
            </View>
        </View>
    );
}
