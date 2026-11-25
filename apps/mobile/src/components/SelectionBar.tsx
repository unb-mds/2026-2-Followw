import { X } from 'lucide-react-native';
import Animated, { withSpring, type EntryExitAnimationFunction } from 'react-native-reanimated';

import { FloatingBar } from '@/components/FloatingBar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { snappy } from '@/lib/motion';

// a contagem pulsa a cada mudança
const pop: EntryExitAnimationFunction = () => {
    'worklet';
    return {
        initialValues: { opacity: 0.4, transform: [{ scale: 0.85 }] },
        animations: {
            opacity: withSpring(1, snappy),
            transform: [{ scale: withSpring(1, snappy) }]
        }
    };
};

/** Barra flutuante de ações sobre itens selecionados, acima da navegação. */
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
        <FloatingBar open={count > 0} label={label} className="pr-1 pl-2">
            <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Limpar seleção"
                className="rounded-full"
                onPress={onClear}
            >
                <Icon as={X} className="size-4" />
            </Button>
            <Animated.View key={count} entering={pop}>
                <Text className="pr-2 text-sm">{`${count} ${units[count === 1 ? 0 : 1]}`}</Text>
            </Animated.View>
            {children}
        </FloatingBar>
    );
}
