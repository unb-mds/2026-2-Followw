import type { LucideIcon } from 'lucide-react-native';

import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface PageStateProps {
    icon?: LucideIcon;
    title: string;
    message?: string;
    className?: string;
    // botão ou link de ação
    children?: React.ReactNode;
}

/** Estado vazio ou aviso centralizado (sem aulas, sem resultados, só para quem entrou...). */
export function PageState({ icon, title, message, className, children }: PageStateProps) {
    return (
        <View className={cn('items-center gap-2 px-6 py-10', className)}>
            {icon && <Icon as={icon} className="size-10 text-muted-foreground" />}
            <Text className="text-center text-base font-semibold">{title}</Text>
            {message && (
                <Text className="text-center text-sm text-muted-foreground">{message}</Text>
            )}
            {children && <View className="mt-2">{children}</View>}
        </View>
    );
}
