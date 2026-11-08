import { ScrollView, type ScrollViewProps } from 'react-native';

import { type RefreshFn, usePullToRefresh } from '@/lib/pull-to-refresh';
import { cn } from '@/lib/utils';

interface ScreenProps extends ScrollViewProps {
    // habilita o pull-to-refresh; veja `refreshQuery` do core
    onRefreshData?: RefreshFn;
}

/** Tela rolável padrão: encaixa sob o header nativo de título grande e atualiza ao puxar. */
export function Screen({ onRefreshData, contentContainerClassName, ...props }: ScreenProps) {
    const refreshControl = usePullToRefresh(onRefreshData);
    return (
        <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            className="flex-1 bg-background"
            contentContainerClassName={cn('gap-4 p-4', contentContainerClassName)}
            {...props}
        />
    );
}
