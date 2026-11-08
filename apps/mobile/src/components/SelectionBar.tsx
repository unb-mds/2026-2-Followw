import { X } from 'lucide-react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Barra flutuante de ações sobre itens selecionados, acima da navegação (`bottom-24` do web). */
export function SelectionBar({
    label,
    count,
    units,
    onClear,
    children
}: {
    label: string;
    count: number;
    units: [one: string, many: string];
    onClear: () => void;
    children: React.ReactNode;
}) {
    const insets = useSafeAreaInsets();
    return (
        <View
            pointerEvents="box-none"
            style={{ bottom: insets.bottom + 96 }}
            className="absolute inset-x-0 z-50 items-center"
        >
            <View
                accessibilityRole="toolbar"
                accessibilityLabel={label}
                className="flex-row items-center gap-1 rounded-full border border-border bg-card py-1 pr-1 pl-2 shadow-lg shadow-black/10"
            >
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Limpar seleção"
                    className="rounded-full"
                    onPress={onClear}
                >
                    <Icon as={X} className="size-4" />
                </Button>
                <Text className="pr-2 text-sm">{`${count} ${units[count === 1 ? 0 : 1]}`}</Text>
                {children}
            </View>
        </View>
    );
}
