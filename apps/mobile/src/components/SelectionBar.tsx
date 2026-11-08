import { X } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Barra flutuante de ações sobre itens selecionados; renderize dentro de um container `relative flex-1`. */
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
    return (
        <View pointerEvents="box-none" className="absolute inset-x-0 bottom-4 items-center">
            <View
                accessibilityLabel={label}
                className="flex-row items-center gap-1 rounded-full border border-border bg-card py-1 pr-1 pl-2 shadow-lg shadow-black/10"
            >
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Limpar seleção"
                    className="size-9 rounded-full"
                    onPress={onClear}
                >
                    <Icon as={X} />
                </Button>
                <Text className="pr-2 text-sm">{`${count} ${units[count === 1 ? 0 : 1]}`}</Text>
                {children}
            </View>
        </View>
    );
}
