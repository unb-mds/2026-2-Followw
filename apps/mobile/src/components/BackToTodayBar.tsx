import { CalendarDays } from 'lucide-react-native';

import { FloatingBar } from '@/components/FloatingBar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** Atalho flutuante para voltar ao dia atual depois de escolher outro. */
export function BackToTodayBar({ open, onBack }: { open: boolean; onBack: () => void }) {
    return (
        <FloatingBar open={open} label="Dia selecionado">
            <Button variant="ghost" size="sm" className="rounded-full" onPress={onBack}>
                <Icon as={CalendarDays} className="size-4 text-primary" />
                <Text className="text-primary">Voltar para hoje</Text>
            </Button>
        </FloatingBar>
    );
}
